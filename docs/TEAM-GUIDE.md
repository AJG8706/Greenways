# Greenways Team Guide

How the TGP team uses the Greenways console, start to finish. The console
lives at **https://greenways-jade.vercel.app/admin**. Questions the guide
doesn't answer go to Alton.

## Signing in

Enter your work email on the sign-in page and tap the link that arrives —
**the link is your sign-in**. No password, no account setup, nothing to
confirm. Links are personal: don't forward them. Only invited emails work;
admins invite from the Team tab.

- **Admin** (Alton): everything, plus unlocking corners, deleting,
  inviting/removing people, API keys, and the Activity page.
- **Editor**: build and edit properties — everything except the above.

## Building a property (the Assembly checklist drives this)

Every property's **Overview tab** shows the assembly checklist: what's
done, what's next, and a link to the tab where the next step happens.
Follow it top to bottom:

1. **Create the property** (Properties → New property). Attach the
   CAD-verified KML right in the dialog — the corners import in the same
   step. Name, address, county.
2. **Verify and lock corners** (Corners tab). Check each corner against
   the survey on the map, move the entrance to the road frontage if the
   numbering looks wrong (C1 sits just before the entrance, clockwise),
   then **Lock (CAD-verified)**. Locked corners are the rule: the buyer
   walk will not serve without them, and only Alton can unlock.
3. **Upload protocol photos** (Photos tab): aerial, gate, homesite, and
   each corner's approach + stake shot. The checklist counts them for you.
   These are the source of truth for generated media — take them to the
   capture protocol, good light, no people or vehicles.
4. **Fill the generation brief** (Media tab): road name, terrain,
   features, homesite, entrance description. One paragraph of honest
   detail beats adjectives.
5. **Generate intro + entrance first**, review both against the source
   photos, approve or reject-with-reason (a reject regenerates
   automatically). Approving both opens the style lock.
6. **Generate remaining** (one button) queues every corner clip and the
   homesite. Review each one the same way. You can also **upload your own
   footage** into any slot — team-shot clips skip review.
7. **Spanish** (Content tab): draft-translate, then a person reads and
   marks it reviewed. Publish is blocked until this is done — that's
   deliberate.
8. **Publish** (Publish tab): the walk goes live at its public link. Grab
   the QR (for the gate sign), the SMS snippets (EN + ES), and pin the
   property to its Monday row so the walk link shows on the board.

## Sending the walk to people

- **Public link + QR**: same for everyone, on the Publish tab.
- **Prospect links**: issue from the Publish tab with the contact's GHL
  id — their walks show up attributed in Analytics. Revoke anytime;
  a revoked link quietly falls back to the public walk.
- Booked tours get their link automatically once the n8n flow is on.

## While buyers walk

- **Analytics tab**: walks, completion, time per corner, language split,
  problem signals. Demo walks (ours) are counted separately, always.
- Buyers see the safety terms on the welcome screen; starting the walk
  records their acknowledgment with a timestamp.

## Trying it yourself

- **Demo tab** → launch a simulated walk (only on properties with demo
  mode on). Same code as the real walk, simulated GPS.
- On site, just open the public link on your phone like a buyer would.

## House rules (enforced by the app, listed so they don't surprise you)

- Corners come only from CAD-verified KML. Never hand-placed, never
  nudged after locking.
- Nothing AI-generated reaches a buyer without a person approving it.
- Every buyer-facing word exists in English **and** Spanish, and a person
  must review the Spanish before publish.
- Buyers never need an account or an app install.
- Uploaded documents (KML/PDF on the Overview tab) are team-internal.
- Everything consequential is logged — the Activity page (admins) shows
  who did what, including sign-ins. Deletes are admin-only.
