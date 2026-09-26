# PXLBLZ Privacy

Last updated: September 26, 2026

White Room Software operates the PXLBLZ web application. This policy explains
what the web app stores, why it stores it, and how to request a copy or deletion
of your account data. Questions and requests can be sent to
[privacy@whiteroomsoftware.com](mailto:privacy@whiteroomsoftware.com).

The PXLBLZ Controller Helper Chrome extension has a separate
[extension privacy policy](https://pxlblz-ide.whiteroomsoftware.com/privacy).
The extension does not have an account or analytics and does not store personal
data for White Room Software.

## Information PXLBLZ stores

When you sign in with GitHub or Google, PXLBLZ stores the provider, provider
account identifier, handle when available, verified email address when
available, display name, and avatar URL. PXLBLZ requests GitHub's `read:user`
and `user:email` scopes or Google's `openid`, `email`, and `profile` scopes.
OAuth access tokens are used only to fetch this profile during sign-in and are
not retained.

PXLBLZ stores the personal Studio content you create, including Patterns, maps,
Mixins, Libraries, Shows, settings, organization metadata, and Controller
profiles. A Controller profile can contain the Controller's device identifier,
name, local-network address, hardware configuration, bindings, zones, and other
last-known device metadata.

PXLBLZ uses this information to authenticate you, link login providers that you
choose to connect, save and restore your workspace, and provide Controller and
support features. An OAuth email address is used for authentication and account
linking, not for marketing.

## Agent editing

When you use the Pixelblaze agent, PXLBLZ sends your request and the Show
information needed for the operation to OpenAI. This can include authored Show
content and source information returned by the editor's tools.

An external agent client, such as Claude Code, Codex, or Claude.ai, can read
the editor information its connection exposes and submit edits to the Show it is
connected to. That client's own privacy policy applies to whatever it receives.

For agent editing, PXLBLZ stores the authorization records needed to identify a
connected client and revoke its access, the name the client registered, and
usage records needed to enforce message and rate limits. Authorization records
expire on their own: access tokens after minutes, refresh tokens after a day of
disuse, and client registrations after 90 days. An agent's work in progress
stays in your browser session until it is accepted; accepted edits to your own
Shows are saved like any other edit.

## Cookies and analytics

PXLBLZ uses short-lived cookies during OAuth sign-in and an HTTP-only session
cookie that can remain valid for up to 30 days. These cookies authenticate your
requests and are not advertising cookies.

The production web app uses Google Analytics 4 to measure visits and coarse
feature usage. Google Analytics may set its own browser identifiers or cookies.
PXLBLZ sends coarse page categories and product actions, such as opening a
Gallery page, creating an entity, or starting a sign-in flow. It does not send
your email address, name, handle, provider identifier, PXLBLZ user identifier,
personal source or content, Controller name, or Controller address to Google
Analytics. Google's handling of analytics data is described in
[Google's Privacy Policy](https://policies.google.com/privacy).

## Service providers

PXLBLZ uses:

- Cloudflare Workers, D1, and Durable Objects to serve the app, store account
  and workspace data, and coordinate agent connections and usage limits;
- GitHub or Google for the login provider you select;
- Google Analytics for the coarse product analytics described above; and
- OpenAI for requests made through the Pixelblaze agent.

OpenAI states that API data is not used to train its models unless the customer
opts in. Its default abuse-monitoring logs may contain prompts and responses
and are retained for up to 30 days, with exceptions for legal requirements or
harm prevention. PXLBLZ sends requests with response storage disabled; this does
not establish Zero Data Retention. See [OpenAI's API data controls](https://developers.openai.com/api/docs/guides/your-data).

White Room Software does not sell your personal information.

## Retention, export, and deletion

Account and Studio data remain stored while your account is active or until you
ask for deletion. Service-provider logs and backup copies can remain for a
limited period under each provider's normal retention and recovery processes.

To request an export or deletion, email
[privacy@whiteroomsoftware.com](mailto:privacy@whiteroomsoftware.com) from an
email address connected to your PXLBLZ account. Include whether you want an
export, deletion, or both. White Room Software may ask for additional proof of
account ownership before fulfilling the request and will confirm when the
request is complete.

## Changes

If this policy changes, PXLBLZ will publish the updated policy here with a new
last-updated date.
