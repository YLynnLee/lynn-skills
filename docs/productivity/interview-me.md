# interview-me

Interviews you about an idea, your notes or a transcript, one question at a time, until your thinking is solid enough to write from. You get back an enriched version of what you came in with, in your own words.

Skill: [`skills/productivity/interview-me/SKILL.md`](../../skills/productivity/interview-me/SKILL.md) · User-invoked · MIT

## What it does

Start it by name, such as `/interview-me`, and hand it something: a transcript, notes, a file, a folder, or just one line.

- **With material**, it reads all of it first, tells you in one line what it takes your core claim to be, and checks that with you. For a folder, it reads what you point to and asks before reading more.
- **With one line**, that line is the core claim, and it starts by asking what's behind it.

It then tracks what you say as a tree of claims: one core claim, the supports under it, and side points that come up along the way, which it queues for later. Each claim gets three checks, and it only asks about the ones still open:

- **Concrete**: you've given one specific instance, such as a moment, a person or a number.
- **Earned**: you've said in your own words why you believe it, and it holds up against one counterexample.
- **Connects**: you've named what changes for someone who believes it.

It asks one short, neutral question at a time, pushes for specifics, and now and then restates your point to check it heard you right. If you stall or push back twice on a claim, it sets that claim aside and notes your reason. About every eight questions it gives a one-line status and asks whether to carry on.

When the core claim and its supports are covered, it asks whether to write the result. The output is a **new file**, separate from your original: your material plus everything the interview surfaced, as one rough piece of prose built from your own answers, ending with a `## Set aside` list. In a folder it's saved as `<source-name>.enriched.md` next to the source; in a chat, you get a downloadable `.md` file.

Finally it offers one next step: turning the enriched version into a draft. It only drafts if you say yes.

## When to reach for it

- You have an idea for a post, talk or doc but it's still vague.
- You have a meeting transcript or messy notes and want to find what you actually think.
- You've written something that feels abstract and want concrete examples pulled out of you.

It's not a writer: it won't produce a polished piece unless you take the drafting offer at the end. And it's user-invoked, so the agent never starts it on its own.

## Common questions

**Will it change my original notes?** No. The output is always a new file.

**Can I stop early?** Yes. Say you're done at any point and it takes that as final.

**Why does it keep asking for examples?** A claim stays open until it has one specific instance behind it. Give it a real moment, and it moves on.

**What if I don't want to defend a point?** Say so, or push back twice, and it sets the claim aside with your reason and moves to the next open one.

## It's working if

- It asks one question at a time, and the questions don't suggest their own answers.
- It checks the core claim with you before digging in.
- You get a status line roughly every eight questions.
- The output reads like you, quoting your answers, with a `## Set aside` section at the end.
