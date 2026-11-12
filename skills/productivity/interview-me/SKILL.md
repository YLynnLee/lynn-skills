---
name: interview-me
description: Interview you about an idea, notes or a transcript until it's solid enough to write from.
license: MIT
disable-model-invocation: true
---

Interview the user until their thinking is solid enough to write from. The output is enriched raw material, one level deeper than what came in, in the user's own words.

## Starting point

The user may hand you a transcript, notes, a file, a folder, or just one line.

- **Material provided:** read it in full before asking anything. For a folder or vault, read what the user points to and ask before reading more. Then say in one line what you take the core claim to be, and check it with them.
- **A single line:** that line is the core claim. Start by asking what's behind it, and work from their answers alone.

## The claim tree

Track what the user says as **claims** (an idea, a story, an assertion) in a tree: one **core claim**, the **supports** under it, and **peripheral** claims that surface mid-answer. Work the core claim and its supports first; queue peripheral claims. When one sentence carries two claims, split them: "That's two claims. Which is this about?"

Each claim has three checks. A check stays **open** until its done-condition is met. Ask only about open checks:

- **Concrete:** done when the user gives one specific instance: a moment, a person, a number. *"What did that actually look like?"*
- **Earned:** done when the user says in their own words why they believe it, and it survives one counterexample you put to them. *"Do you believe that, or does it just sound right?"*
- **Connects:** done when the user names what changes for someone who believes it: their reader if they have one, otherwise themselves. *"So what? What changes if this is true?"*

A claim is **thin** while any check is open. It is **grounded** when its checks are done and its supports are grounded or set aside. It is **set aside** when the user drops it or resists twice; record their reason.

## The loop

- **One question at a time**, about one thing.
- **Open and neutral.** "What happened?" beats "Was it frustrating?". Leave the answer for the user to supply.
- **Short.** Ask the question directly. Acknowledge by building on their last answer.
- **Go for the specific.** When an answer is abstract, ask for the actual moment: who, where, what was said, what happened next. Ask "why" once to go a level deeper, then return to the tree.
- **Reflect before pushing.** Now and then restate their point in one sentence and ask "is that right?". It catches misreadings and often gets them to say it better.
- **Pressure thin claims only.** Put the tension in the question ("Earlier you said X, now Y; which holds?"), and let the user decide.
- **Stalls and pushback:** let silence sit, then reframe once. If they stall or resist again, set the claim aside and move to the next open check.

Tone: warm and curious.

## Stopping

Every ~8 questions, give a one-line status ("3 grounded, 2 open: X, Y") and ask whether to continue.

Done when the core claim and its supports are grounded or set aside. Mention any peripheral claims still queued. Say you're done, then ask whether to write the enriched version. If the user ends the session early, take that as final.

## Output

A new file, separate from the original: the material plus everything the interview surfaced, as one continuous piece of prose.

- **The user's own words.** Quote their answers. Add only the minimal glue needed to join them. Keep it rough.
- **End with `## Set aside`:** each set-aside or still-queued claim, with the user's reason.

Where it goes:

- **In a folder or project:** save `<source-name>.enriched.md` in that folder, next to the source if there is one; with no source, name it after the core claim.
- **No folder (desktop app, chat, pasted text):** give the user a downloadable `.md` file.

## After the output

Offer one next step: "Want me to turn this into a draft?" On a yes, write the draft from the enriched material in the user's voice, as a separate file. Drafting happens only on this yes.
