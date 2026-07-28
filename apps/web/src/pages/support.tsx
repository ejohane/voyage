import { LegalPage, LegalSection, legalLinkClassName } from "@/components/legal-page";

function SupportPage() {
  return (
    <LegalPage title="Support">
      <LegalSection title="Get help with Voyage">
        <p>
          Report a problem or request help through the public Voyage issue tracker. Do not include
          passwords, authentication tokens, booking confirmation numbers, or other private trip
          details in a public report.
        </p>
        <p>
          <a
            className={legalLinkClassName}
            href="https://github.com/ejohane/voyage/issues"
            rel="noreferrer"
            target="_blank"
          >
            Open the Voyage support tracker
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}

export default SupportPage;
