# 0010. A platform that stands by itself, with a section for each organisation

- Status: Accepted
- Date: 2026-10-13
- Decision owner: project owner (M16 plan §11, seven answers; five points confirmed on 2026-10-13)

## Context

Until M15 the product was built as if it were one association: "member" opened everything, the association's administrator ran everything, and the association's name was written into the texts. The owner decided that the product is independent: a professional platform for physicians (urologists in Israel first), in which an association is one organisation among possibly several. The real association has not agreed to appear in it, so it must not.

## Decision

**Three things that were one.** An account (a person signed up), a verified account (`users.verified_at`: known to be a physician), and a membership (belonging to one organisation, with a type, dates and a card). "Verified" is the key to the platform: chat, groups, the directory, the library. A membership opens that organisation's section, and ending it does not close the platform. Until M17 builds verification of its own, whoever an organisation accepts or imports as a member becomes verified.

**Ownership.** Every organisation's thing carries `organisation_id`.

- Always an organisation's: membership types, memberships, applications, import batches.
- An organisation's or the platform's own (`organisation_id` null): news, events, speakers, rooms, messages to members, staff roles.
- The platform's only: the education library, exam practice, guidelines, the shared category lists, accounts, institutions, the audit log, settings.

**Four viewing settings instead of three:** everyone, verified physicians, members of the organisation that owns the item, selected membership types. The third needs an owning organisation, which the database checks.

**Staff in two places.** A role is held on the platform or inside one organisation, and a person can hold both. Every staff route checks whose thing it is on the server; another owner's thing answers "not found", exactly as one that does not exist. Platform staff reach into an organisation's things only with a named permission (`organisations.access`, held by the super administrator), and reading a member's file that way is written to the audit log.

**The screens are built for the case that exists: one organisation.** The site and the app have a section per organisation (who it is, the person's membership and card, its news, events and rooms), and a list of organisations that the header skips while there is one. The data and the rules are tested with two.

**No real organisation in the demo.** The demo's organisation is a fictional society, marked as fictional in its name. The content once imported from a real association's website is out of the seed; the importer stays in the repository, unused. A real organisation appears only with its written agreement.

**The name.** The product is Med Connect ("מד קונקט"), chosen by the owner. Not checked for a trademark or a free web address; that is done before it is used in public.

## Alternatives considered

- **Keep one association, rename later:** the smallest change, and wrong on the facts: the association has not agreed, and its name was in the product.
- **A separate installation per organisation:** no shared code paths to get wrong, but then there is no platform: no shared directory, chat or library, which are the point.
- **A separate database schema per organisation:** stronger separation, and much heavier for one organisation now; a person's account, chat and profile cross organisations by design.
- **Organisations that sign themselves up:** left out on purpose. It is a product of its own, and nothing uses it yet.

## Consequences

- A forgotten check would show one organisation's data to another. Guarded by a test that reads every organisation-scoped route from the running application and tries each as another organisation's office, and by a second organisation in the test data.
- "Membership ended" no longer means "locked out". A suspended or expired member keeps chat, the directory and the library, as a verified physician. This is a change a user can see.
- Categories (news, events, rooms) and report reasons are the platform's shared lists, kept by platform staff. Room categories per organisation are deferred.
- Only a super administrator gives roles, also an organisation's own staff roles.
- The member import tells an organisation's office whether an email address already has an account. Accepted by the owner.
- Names the rename did not touch: the local databases and their roles (`iua_connect`, `iua_owner`, `iua_app`, and the setting `iua.app_role` in applied migrations), cookie and token names, and the repository's own name. They are not shown to users; changing them is a separate, deliberate step.
