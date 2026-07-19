import { LegalPage, LegalSection, legalLinkClassName } from "@/components/legal-page";

function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <LegalSection title="Information Voyage handles">
        <p>
          Voyage stores the information you provide to create and coordinate trips, including your
          account identity, trip names, destinations, dates, travel and stay details, and trip
          memberships.
        </p>
      </LegalSection>

      <LegalSection title="Destination search">
        <p>
          When you search for a destination, Voyage sends your search text and language preference
          to Google Places to return relevant countries, cities, addresses, and places. When you
          select a suggestion, Voyage stores the destination text you entered and the selected
          Google Place ID. Voyage does not persist the other Google autocomplete result details.
        </p>
        <p>
          Google processes this information under the{" "}
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

      <LegalSection title="Service providers">
        <p>
          Voyage relies on service providers to operate the product, including Clerk for account
          authentication, Cloudflare for hosting and data storage, and Google Maps Platform for
          destination search. These providers process information on Voyage’s behalf or as described
          in their own terms and privacy notices.
        </p>
      </LegalSection>

      <LegalSection title="Data choices and security">
        <p>
          You control the trip information you add. Voyage uses access controls and encrypted
          service credentials to protect the product, but no online service can guarantee absolute
          security. This policy may change as Voyage evolves; the date above will be updated when it
          does.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

export default PrivacyPage;
