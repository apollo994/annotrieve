from fastapi import APIRouter
from api import annotations, assemblies, taxons, organisms, bioprojects, jobs, analytics


router = APIRouter()

router.include_router(annotations.router, tags=["annotations"]) 
router.include_router(assemblies.router, tags=["assemblies"])
router.include_router(taxons.router, tags=["taxons"])
router.include_router(organisms.router, tags=["organisms"])
router.include_router(bioprojects.router, tags=["bioprojects"])
router.include_router(analytics.router, tags=["analytics"])
router.include_router(jobs.router, tags=["jobs"])