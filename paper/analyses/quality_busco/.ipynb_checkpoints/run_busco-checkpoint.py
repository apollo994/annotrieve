#!/usr/bin/env python3
"""
Run BUSCO on the proteins of an Annotrieve annotation.

Same logic as https://github.com/guigolab/BUSCO-tracker:
  1. download the annotation and its assembly, and match the sequence names
     (annocli download --add-asm --fix-alias)
  2. extract the proteins: clean the GFF, run gffread, keep the longest
     isoform per gene
  3. run BUSCO in protein mode with the given lineage

Requires annocli, gffread, busco and awk on the PATH.

Usage:
    python run_busco.py <annotation_id> <busco_lineage> [-o OUTDIR] [--cpu N] [--force]

Examples:
    python run_busco.py 22fa79d2c5ab33e26438434bb45a271b eukaryota_odb12
    python run_busco.py 22fa79d2c5ab33e26438434bb45a271b /path/to/busco_downloads/lineages/eukaryota_odb12

<busco_lineage> is either a lineage name (BUSCO downloads it if needed) or the
path to an already downloaded lineage folder (BUSCO runs with --offline).
Results are written to OUTDIR (default: busco_<annotation_id>):
    OUTDIR/annotrieve/                                  downloaded annotation + assembly
    OUTDIR/<annotation>_proteins.faa                    longest protein per gene
    OUTDIR/busco_<lineage>/                             BUSCO output
    OUTDIR/BUSCO.tsv                                    summary row (BUSCO-tracker format)
"""
import argparse
import csv
import gzip
import logging
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BUSCO_HEADER = ["annotation_id", "lineage", "busco_count", "complete",
                "single", "duplicated", "fragmented", "missing"]

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Cleans a GFF3 before protein extraction with gffread
# (BUSCO-tracker scripts/clean_gff.awk).
CLEAN_GFF_AWK = r"""
# - Drops features on MT/chrM and features with '?' strand
# - TOGA2: escapes commas in column 9 (they crash gffread)
# - gene -> CDS without a transcript level: adds one mRNA per CDS ID
# - Drops CDS attached directly to a pseudogene
# Assumes gene and pseudogene lines precede their CDS lines, as in NCBI GFFs.

BEGIN { FS = OFS = "\t" }

/^#/ { print; next }

$1 == "MT" || $1 == "chrM" || $7 == "?" { next }

$2 == "TOGA2" { gsub(/,/, "%2C", $9) }

$3 == "pseudogene" && match($9, /ID=[^;]+/) { pseudogene[substr($9, RSTART + 3, RLENGTH - 3)] = 1 }

$3 == "CDS" && match($9, /Parent=[^;]+/) && (substr($9, RSTART + 7, RLENGTH - 7) in pseudogene) { next }

$3 == "gene" && match($9, /ID=[^;]+/) {
    gene_span[substr($9, RSTART + 3, RLENGTH - 3)] = $4 OFS $5
}

$3 == "CDS" && match($9, /Parent=[^;]+/) && (substr($9, RSTART + 7, RLENGTH - 7) in gene_span) {
    parent = substr($9, RSTART + 7, RLENGTH - 7)
    tx = match($9, /ID=[^;]+/) ? "tx-" substr($9, RSTART + 3, RLENGTH - 3) : "tx-" parent
    if (!(tx in added)) {
        added[tx] = 1
        print $1, $2, "mRNA", gene_span[parent], ".", $7, ".", "ID=" tx ";Parent=" parent
    }
    sub(/Parent=[^;]+/, "Parent=" tx, $9)
}

{ print }
"""

# Selects the longest protein per gene
# (BUSCO-tracker scripts/longest_transcript_per_gene.awk).
LONGEST_TRANSCRIPT_AWK = r"""
FNR == 1 { file_num++ }

# Pass 1 (GFF3): transcript -> parent gene
file_num == 1 {
    if (/^#/)                                  next
    if ($3 != "mRNA" && $3 != "transcript")    next

    id = ""; parent = ""
    n = split($9, attrs, ";")
    for (i = 1; i <= n; i++) {
        if (attrs[i] ~ /^ID=/)     id     = substr(attrs[i], 4)
        if (attrs[i] ~ /^Parent=/) parent = substr(attrs[i], 8)
    }
    if (id != "" && parent != "") transcript_parent[id] = parent
    next
}

# Pass 2 (FAA): store sequences and count amino acids
file_num == 2 {
    if (/^>/) {
        current         = substr($1, 2)
        fasta_header[current] = $0
        aa_count[current]     = 0
        fasta_seq[current]    = ""
    } else {
        gsub(/[[:space:]]/, "")
        aa_count[current] += length($0)
        fasta_seq[current]  = fasta_seq[current] $0
    }
    next
}

END {
    for (tid in transcript_parent) {
        gid = transcript_parent[tid]
        if (!(gid in longest_transcript) || aa_count[tid] > aa_count[longest_transcript[gid]])
            longest_transcript[gid] = tid
    }
    for (gid in longest_transcript) {
        tid = longest_transcript[gid]
        if (tid in fasta_header) {
            print fasta_header[tid]
            print fasta_seq[tid]
        }
    }
}
"""


def run(cmd, step, stdout=None):
    """Run a command, exit with its stderr on failure."""
    logger.info(f"{step}: {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, stdout=stdout, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        sys.exit(f"{step} failed (exit code {result.returncode}):\n{result.stderr}")
    return result


def gunzip(src, dest):
    """Decompress src to dest if it is gzipped, else copy it."""
    opener = gzip.open if str(src).endswith(".gz") else open
    with opener(src, "rb") as fin, open(dest, "wb") as fout:
        shutil.copyfileobj(fin, fout)


def download(annotation_id, outdir):
    """Download annotation + assembly with matched sequence names.

    Returns (aliased gff, assembly fasta).
    """
    run(["annocli", "download", "--annotation-ids", annotation_id,
         "--add-asm", "--fix-alias", "-o", str(outdir)], "download")

    gffs = sorted(outdir.rglob("*.aliasMatch.gff.gz"))
    fastas = sorted(outdir.rglob("*.fna.gz"))
    if len(gffs) != 1 or len(fastas) != 1:
        sys.exit(f"Expected one aliasMatch GFF and one assembly in {outdir}, "
                 f"found {len(gffs)} and {len(fastas)}")
    return gffs[0], fastas[0]


def extract_proteins(gff_gz, fasta_gz, protein_file):
    """Clean the GFF, extract proteins with gffread, keep the longest per gene."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        gff, fasta = tmp / "input.gff3", tmp / "input.fna"
        gunzip(gff_gz, gff)
        gunzip(fasta_gz, fasta)

        clean_awk = tmp / "clean_gff.awk"
        longest_awk = tmp / "longest_transcript_per_gene.awk"
        clean_awk.write_text(CLEAN_GFF_AWK)
        longest_awk.write_text(LONGEST_TRANSCRIPT_AWK)

        clean_gff = tmp / "clean.gff"
        with open(clean_gff, "w") as f:
            run(["awk", "-f", str(clean_awk), str(gff)], "clean_gff", stdout=f)

        # -S writes stop codons as '*': BUSCO rejects '.' when deciding the input is protein
        all_proteins = tmp / "all_proteins.faa"
        run(["gffread", "-g", str(fasta), "-S", "-y", str(all_proteins), str(clean_gff)],
            "gffread")

        longest = tmp / "longest_proteins.faa"
        with open(longest, "w") as f:
            run(["awk", "-f", str(longest_awk), str(clean_gff), str(all_proteins)],
                "longest_isoforms", stdout=f)

        # BUSCO refuses '/' and '"' in the first word of FASTA headers
        with open(longest) as fin, open(protein_file, "w") as fout:
            for line in fin:
                fout.write(re.sub(r'[/"]', "_", line) if line.startswith(">") else line)

    if protein_file.stat().st_size == 0:
        sys.exit(f"Protein file {protein_file} is empty")


def run_busco(proteins, lineage, outdir, cpu, force):
    """Run BUSCO in protein mode. Returns the BUSCO output folder."""
    lineage_is_dir = Path(lineage).is_dir()
    lineage_name = Path(lineage).name if lineage_is_dir else lineage
    out_name = f"busco_{lineage_name}"

    cmd = ["busco", "-m", "protein", "-i", str(proteins), "-l", lineage,
           "--cpu", str(cpu), "--out_path", str(outdir), "-o", out_name]
    if lineage_is_dir:
        cmd.append("--offline")
    if force:
        cmd.append("-f")
    run(cmd, "busco")
    return outdir / out_name


def parse_busco_results(busco_dir):
    """Parse the BUSCO short summary (same fields as BUSCO-tracker)."""
    summary_files = list(busco_dir.glob("short_summary.*.txt"))
    if not summary_files:
        sys.exit(f"BUSCO summary file not found in {busco_dir}")
    content = summary_files[0].read_text()

    def find(pattern, cast):
        m = re.search(pattern, content, re.IGNORECASE)
        return cast(m.group(1)) if m else "NA"

    return {
        "lineage": find(r"lineage dataset is: (\S+)", str),
        "busco_count": find(r"(\d+)\s+total BUSCO", int),
        "complete": find(r"C:(\d+(?:\.\d+)?)%", float),
        "single": find(r"S:(\d+(?:\.\d+)?)%", float),
        "duplicated": find(r"D:(\d+(?:\.\d+)?)%", float),
        "fragmented": find(r"F:(\d+(?:\.\d+)?)%", float),
        "missing": find(r"M:(\d+(?:\.\d+)?)%", float),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Run BUSCO on the proteins of an Annotrieve annotation.")
    parser.add_argument("annotation_id", help="Annotrieve annotation ID (md5)")
    parser.add_argument("lineage",
                        help="BUSCO lineage name (e.g. eukaryota_odb12) or path to a lineage folder")
    parser.add_argument("-o", "--outdir",
                        help="output folder (default: busco_<annotation_id>)")
    parser.add_argument("--cpu", type=int, default=4, help="BUSCO threads (default: 4)")
    parser.add_argument("--force", action="store_true",
                        help="overwrite an existing BUSCO output folder")
    args = parser.parse_args()

    for tool in ("annocli", "gffread", "busco", "awk"):
        if shutil.which(tool) is None:
            sys.exit(f"{tool} not found on PATH")

    outdir = Path(args.outdir or f"busco_{args.annotation_id}").resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    logger.info("STEP 1: download annotation and assembly, fix aliases")
    gff, fasta = download(args.annotation_id, outdir / "annotrieve")

    logger.info("STEP 2: extract proteins")
    proteins = outdir / f"{args.annotation_id}_proteins.faa"
    extract_proteins(gff, fasta, proteins)

    logger.info("STEP 3: run BUSCO")
    busco_dir = run_busco(proteins, args.lineage, outdir, args.cpu, args.force)

    results = parse_busco_results(busco_dir)
    busco_tsv = outdir / "BUSCO.tsv"
    with open(busco_tsv, "w", newline="") as f:
        writer = csv.writer(f, delimiter="\t", lineterminator="\n")
        writer.writerow(BUSCO_HEADER)
        writer.writerow([args.annotation_id] + [results[k] for k in BUSCO_HEADER[1:]])

    logger.info(f"Done: {results}")
    logger.info(f"Summary written to {busco_tsv}")


if __name__ == "__main__":
    main()
