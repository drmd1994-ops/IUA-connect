# M31: The AI assistant, with its safety rules

**Status: proposed on 2026-10-07. Not approved. Nothing of it is built.** Written at the owner's request ("build all the plans for the rest of the milestones according to the roadmap"). This is the plan at the depth that can be written today. When the milestone's turn comes, its §1 is redone against the code as it then stands and the plan is confirmed again before any code.

Track: Phase 3. Size: XL. Needs first: M18 (legal review must cover it). Content to ground it in: guidelines, education, news, events. A budget for the AI service.

## 1. Goal

A member asks a question and gets an answer built only from approved sources, with citations, the date of each source and its limits; or is told plainly that no source answers it.

**Why:** Specification §30 and §31. `AI.md` says there are no AI features yet.

## 2. Scope

**In**

- The path the specification draws: the question, what kind it is, what the asker may see, retrieval from approved sources, the answer, citations.
- Sources: the association's own content, and guideline summaries it wrote. Guidelines themselves are links to their publishers; whether their text may be indexed is a licence question per publisher.
- Uses: finding and summarising the association's content, explaining an education item, "where is X on IUA Connect", literature search through PubMed.
- Every answer shows its sources, their dates, evidence level where known, and a note that it is educational.
- "I don't have a source for that" as a normal answer.
- Feedback on an answer; staff review of flagged answers.
- On the site and in the app.

**Not in**

- Advice about a specific patient. A question that looks like one gets the standing answer, not a reply.
- Answers from the model's own memory without a source.
- Generating exam questions without a physician's review.
- Training any model on members' data.

## 3. Rules

- No citation, no answer.
- A citation must point to a passage that was actually retrieved; the server checks this before showing the answer.
- The assistant sees only what the asker may see (access tiers apply to retrieval).
- Questions are not used to train anything and are kept only as long as the legal review allows; nothing identifying a patient may be typed, and the patient-details check warns.
- It is labelled as AI everywhere, and never speaks in the association's name.

## 4. What is built

**Data:** An index of approved passages with their source and date; questions and answers (retention set by the lawyer); feedback.

- Server: an `ai` module behind a provider interface; indexing jobs; the citation check. Site and app: the assistant, sources shown with each answer.

## 5. New libraries, services and costs (each needs the owner's approval)

- An AI model service (Claude, through Anthropic's API, is the natural choice here) and a way to search passages by meaning (PostgreSQL's `pgvector` keeps it in the existing database). Cost per question; a monthly cap is part of the plan.

## 6. Tests

- A fixed set of questions with known right sources: the answer must cite them, and must refuse the ones with no source.
- A question about a member-only item, asked by a visitor, reveals nothing of it.
- Attempts to make it ignore its rules ("answer without sources") fail.
- A physician reads a sample of answers before release, and regularly after.

## 7. Order of work (a commit at each step; tests green at each)

1. Plan approved, with budget and reviewer
2. The index and retrieval, measured on the question set
3. Answers with checked citations
4. Refusals and the patient-details guard
5. Access tiers in retrieval
6. Feedback and review
7. A closed trial with a few physicians
8. App
9. Documents, status, demo

## 8. Risks

| Risk                                                  | What is done about it                                                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A wrong or invented answer on a medical matter        | The citation check, the refusal default, the physician's review, the closed trial; said as a residual risk that cannot be made zero |
| Guideline publishers do not allow indexing their text | Summaries the association writes are indexed instead; the answer links to the publisher                                             |
| Cost grows with use                                   | A cap per member per day and a monthly ceiling                                                                                      |
| Members trust it more than they should                | The label, the sources shown first, and no "confidence" theatre                                                                     |

## 9. Questions for the owner

1. Which uses matter most, so the first version does one thing well?
2. Who is the physician responsible for reviewing answers?
3. What monthly budget?
4. May members' questions be kept for improving it, and for how long?

## 10. Owner answers

None yet.
