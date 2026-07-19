import { LegalPage, LegalSection, legalLinkClassName } from "@/components/legal-page";

function TermsPage() {
  return (
    <LegalPage title="Terms of use">
      <LegalSection title="Using Voyage">
        <p>
          By using Voyage, you agree to use the service lawfully and to provide accurate account
          information. You are responsible for activity under your account and for the trip content
          you add or share with other people.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep ownership of the trip information you provide. You give Voyage permission to
          store, process, and display that information only as needed to operate and improve the
          service and provide the collaboration features you request.
        </p>
      </LegalSection>

      <LegalSection title="Google Maps features">
        <p>
          Voyage’s destination search uses Google Maps Platform. Your use of Google Maps features
          and content is subject to the current{" "}
          <a
            className={legalLinkClassName}
            href="https://maps.google.com/help/terms_maps/"
            rel="noreferrer"
            target="_blank"
          >
            Google Maps/Google Earth Additional Terms
          </a>
          ,{" "}
          <a
            className={legalLinkClassName}
            href="https://policies.google.com/terms"
            rel="noreferrer"
            target="_blank"
          >
            Google Terms of Service
          </a>
          , and{" "}
          <a
            className={legalLinkClassName}
            href="https://policies.google.com/privacy"
            rel="noreferrer"
            target="_blank"
          >
            Google Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          Voyage may change, suspend, or discontinue features and does not promise uninterrupted
          availability. These terms may change as the product evolves; continued use after an
          updated date means you accept the revised terms.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

export default TermsPage;
