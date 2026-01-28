"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Database, Eye, Lock, Mail, Clock, FileText } from "lucide-react"

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Introduction
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              This Privacy Policy describes how Annotrieve ("we", "our", or "us") collects, uses, and protects 
              information when you use our service. We are committed to protecting your privacy and complying with 
              the General Data Protection Regulation (GDPR) and other applicable data protection laws.
            </p>
            <p>
              Annotrieve is a research platform for accessing eukaryotic genome annotations. We collect minimal 
              server-side logs solely for the purpose of understanding usage patterns by geographic location (country level).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Data We Collect
            </CardTitle>
            <CardDescription>
              We collect only the minimum data necessary for usage analytics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              When you access Annotrieve, our web server automatically logs the following information for each request:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>IP Address</strong> – Your Internet Protocol address, which we use to determine your 
                approximate geographic location (country level only). We extract the real client IP from the 
                X-Forwarded-For header when available.
              </li>
              <li>
                <strong>Request URI</strong> – The specific page or API endpoint you accessed (e.g., 
                <code className="mx-1 px-1.5 py-0.5 bg-muted rounded text-sm">/annotrieve/api/v0/annotations</code>).
              </li>
              <li>
                <strong>HTTP Method</strong> – The type of request (GET, POST, etc.).
              </li>
              <li>
                <strong>Timestamp</strong> – The date and time of your request in ISO 8601 format.
              </li>
              <li>
                <strong>User Agent</strong> – Information about your browser or client application (e.g., 
                browser type and version).
              </li>
              <li>
                <strong>HTTP Referer</strong> – The webpage that referred you to our service (if applicable).
              </li>
              <li>
                <strong>HTTP Status Code</strong> – The response status (e.g., 200, 404, 500).
              </li>
              <li>
                <strong>Request Processing Time</strong> – How long it took to process your request (in seconds).
              </li>
            </ul>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm font-semibold mb-2">What we do NOT collect:</p>
              <ul className="list-disc pl-6 space-y-1 text-sm">
                <li>No cookies or tracking identifiers</li>
                <li>No personal information (name, email, etc.)</li>
                <li>No client-side analytics or tracking scripts</li>
                <li>No data from static asset requests (images, CSS, JavaScript files are excluded from logging)</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              How We Use Your Data
            </CardTitle>
            <CardDescription>
              Limited use for usage analytics only
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              The logged data is used <strong>exclusively</strong> for the following purposes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Usage Tracking by Country</strong> – We process IP addresses to determine the country 
                of origin for requests. This helps us understand the geographic distribution of our users and 
                the global reach of the Annotrieve platform.
              </li>
              <li>
                <strong>Service Optimization</strong> – Analyzing request patterns, response times, and error 
                rates to improve service performance and reliability.
              </li>
              <li>
                <strong>Research Analytics</strong> – Understanding how the platform is used for research 
                purposes, including which API endpoints are most accessed and usage trends over time.
              </li>
            </ul>
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>We do NOT:</strong> use this data for commercial purposes, share it with third parties, 
                create user profiles, or use it for marketing or advertising.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Legal Basis for Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Under GDPR, we process your data based on <strong>legitimate interests</strong> (Article 6(1)(f) GDPR). 
              Our legitimate interests are:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Understanding usage patterns to improve and optimize our research platform</li>
              <li>Monitoring service performance and ensuring reliability</li>
              <li>Analyzing geographic distribution of users for research impact assessment</li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              We have balanced our legitimate interests against your privacy rights and determined that the minimal 
              data collection (IP addresses and request metadata) is necessary and proportionate for these purposes.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Data Retention
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Server logs are retained for a reasonable period necessary for analytics and troubleshooting. 
              The specific retention period may vary based on operational needs, but we aim to:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Retain detailed logs for a limited period (typically several months)</li>
              <li>Aggregate usage statistics by country may be retained longer for research analytics</li>
              <li>Delete or anonymize logs when they are no longer needed for the purposes described above</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Data Security
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              We implement appropriate technical and organizational measures to protect your data:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Logs are stored securely on our servers with restricted access</li>
              <li>Access to log data is limited to authorized personnel only</li>
              <li>We use industry-standard security practices to protect against unauthorized access, 
                  alteration, disclosure, or destruction of data</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Your Rights Under GDPR
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              As a data subject under GDPR, you have the following rights:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>
                <strong>Right of Access</strong> – You can request information about what personal data we hold about you.
              </li>
              <li>
                <strong>Right to Rectification</strong> – You can request correction of inaccurate data.
              </li>
              <li>
                <strong>Right to Erasure</strong> – You can request deletion of your data (subject to legal obligations).
              </li>
              <li>
                <strong>Right to Restrict Processing</strong> – You can request that we limit how we use your data.
              </li>
              <li>
                <strong>Right to Data Portability</strong> – You can request a copy of your data in a structured format.
              </li>
              <li>
                <strong>Right to Object</strong> – You can object to processing based on legitimate interests.
              </li>
              <li>
                <strong>Right to Withdraw Consent</strong> – If processing is based on consent, you can withdraw it at any time.
              </li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              <strong>Note:</strong> Since we only collect IP addresses and request metadata, and we do not 
              maintain user accounts or personal identifiers, it may be difficult to identify specific requests 
              associated with you. However, if you can provide your IP address and approximate timestamps, we 
              will do our best to assist with your request.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              If you have questions about this Privacy Policy, wish to exercise your rights, or have concerns 
              about how we handle your data, please contact us:
            </p>
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-semibold mb-2">Data Protection Contact</p>
              <p>
                Email:{" "}
                <a 
                  href="mailto:emilio.righi@crg.eu" 
                  className="text-primary underline-offset-4 hover:underline"
                >
                  emilio.righi@crg.eu
                </a>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              We will respond to your inquiry within 30 days as required by GDPR.
            </p>
            <p className="text-sm text-muted-foreground">
              If you are not satisfied with our response, you have the right to lodge a complaint with your 
              local data protection authority (supervisory authority).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Changes to This Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material changes 
              by updating the "Last updated" date at the top of this page. We encourage you to review this 
              Privacy Policy periodically to stay informed about how we protect your data.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
