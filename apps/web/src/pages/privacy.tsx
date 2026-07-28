import { LegalPage, LegalSection, legalLinkClassName } from "@/components/legal-page";

function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <LegalSection title="Information Voyage handles">
        <p>
          Voyage stores the information you provide to create and coordinate trips, including your
          account identity, trip names, destinations, dates, travel and stay details, and trip
          memberships. When someone is invited, Voyage stores their email address and invitation
          status so the organizer can manage access.
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
          authentication, Cloudflare for hosting and data storage, Resend for trip invitation email,
          and Google Maps Platform for destination search. These providers process information on
          Voyage’s behalf or as described in their own terms and privacy notices.
        </p>
      </LegalSection>

      <LegalSection title="ChatGPT and Codex connection">
        <p>
          If you connect Voyage to ChatGPT or Codex, OpenAI receives the trip information needed to
          answer your request, such as trip names, destinations, dates, transportation, stays,
          plans, booking metadata, and your access level. The connection can create or change Voyage
          data only through the tools you invoke and the confirmation steps shown to you.
        </p>
        <p>
          Voyage uses your connected account identity to enforce trip membership and does not send
          your Voyage password, authentication token, or internal audit records in tool results.
          OpenAI processes connected-app data under its own terms and privacy notice.
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
