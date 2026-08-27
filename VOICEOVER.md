# Provah — voiceover script (ElevenLabs-ready)

Voiceover-first workflow: record this narration, then cut screen capture to
match its timing. Each beat below is a separate paste-into-ElevenLabs block
— generate them as separate clips so you can re-take one beat without
re-generating the whole thing. Estimated durations assume a measured,
confident pace (~150 words per minute); ElevenLabs will usually land close
to this if you don't push its speed slider.

Production notes (read before recording, don't paste these into ElevenLabs):
- Written "Stark" throughout instead of "STRK" — spelled-out tickers get
  read letter-by-letter by TTS models. On-screen text/graphics can still say
  "STRK" and "STRK20"; only the spoken narration uses "Stark."
- No hashes, addresses, or hex ever appear in the narration — say "this
  transaction" or "this wallet," never read digits aloud.
- "Provah" reads correctly as written (PRO-vah).
- Each block is written as continuous prose with no markdown — copy the
  block's text only, not its heading, into ElevenLabs.
- Voice setting suggestion: a stability around 40-50% and a touch of style
  exaggeration reads well for confident, demo-narration energy without
  sounding robotic on the technical terms.

---

## Beat 0 — Hook (~10 seconds, 24 words)

Paste this into ElevenLabs:

```
This is Provah. I can prove my wallet's real, public Stark-twenty activity, hand a token to a total stranger, and they redeem it. Nothing on-chain ever connects the two wallets. Watch.
```

Screen cue: cold open on the live site, hero section visible. Cut to the
app widget right as you say "Watch."

---

## Beat 1 — Capability Smoke Test: works for anyone (~30 seconds, 70 words)

Paste this into ElevenLabs:

```
First, the fastest way to try this. This campaign, Capability Smoke Test, needs no deposit at all. It's satisfied by any wallet, even one that's never done anything on-chain. I connect a wallet, generate a pass, and sign a quick message proving I control it. Now I connect a completely different wallet and claim. Gas-sponsored. That second wallet never needed any Stark to do this.
```

Screen cue: campaign picker showing "Capability Smoke Test" with its "no
deposit needed" badge → connect Wallet A → self-check appears instantly →
sign prompt → Generate pass → disconnect → connect Wallet B → Claim.

---

## Beat 2 — Real predicate, real reward (~45 seconds, 105 words)

Only record this beat if you have a wallet with real pool deposit history
to demo it live.

Paste this into ElevenLabs:

```
Now the real version. This wallet actually deposited Stark into the live privacy pool. Watch the self-check run, right here in my browser, against public chain data. It agrees before I even click anything, because it's not taking Provah's word for it. I generate a pass, switch to a second wallet, and claim. That claim is a real transaction, on mainnet, right now. And because this is the reward campaign, watch the balance. That's not a receipt. That's real Stark, moving, to a wallet that never touched the pool.
```

Screen cue: select "Stark Welcome Reward" campaign → connect qualifying
Wallet A → point at self-check "You qualify" line → Generate pass → connect
Wallet B → Claim → hold on the balance delta (+0.05 STRK) appearing.

---

## Beat 3 — Destination lock, optional (~20 seconds, 48 words)

Cut this beat entirely if you're keeping the video under 90 seconds.

Paste this into ElevenLabs:

```
One more thing. When I generate a pass, I can lock it to one destination wallet, up front. Try to claim it from the wrong wallet, and Provah refuses, before it ever signs anything. Only the correct wallet can redeem it.
```

Screen cue: check "Lock this pass to one destination wallet," paste an
address, generate → attempt claim from wrong wallet, show the rejection →
attempt claim from correct wallet, show success.

---

## Beat 4 — Closing wow: independent verification (~20 seconds, 46 words)

Paste this into ElevenLabs:

```
Here's the part that matters most. This check isn't Provah's word either. It's my own browser, reading straight off Starknet mainnet, independent of Provah's backend entirely. Anyone watching this, right now, could go verify the exact same thing themselves.
```

Screen cue: click "Verify on-chain," hold on the confirmation ("nullifier
confirmed consumed on mainnet, read directly via public RPC").

---

## Optional sign-off line (~8 seconds, 20 words)

Use this if you want a closing line instead of ending cold on the
verification screen.

```
Two ways to try it, today, on real mainnet. Same primitive either way, and every step of it checks out.
```

---

## Full script, single block (for a one-take recording)

If you'd rather generate one continuous audio file instead of separate
clips, paste this entire block into ElevenLabs at once. It's Beats 0, 1,
2, and 4 back to back (Beat 3, destination lock, is left out here since
it's the first thing to cut for time — add it back in manually between
Beat 2 and Beat 4 if you're doing the longer cut).

```
This is Provah. I can prove my wallet's real, public Stark-twenty activity, hand a token to a total stranger, and they redeem it. Nothing on-chain ever connects the two wallets. Watch.

First, the fastest way to try this. This campaign, Capability Smoke Test, needs no deposit at all. It's satisfied by any wallet, even one that's never done anything on-chain. I connect a wallet, generate a pass, and sign a quick message proving I control it. Now I connect a completely different wallet and claim. Gas-sponsored. That second wallet never needed any Stark to do this.

Now the real version. This wallet actually deposited Stark into the live privacy pool. Watch the self-check run, right here in my browser, against public chain data. It agrees before I even click anything, because it's not taking Provah's word for it. I generate a pass, switch to a second wallet, and claim. That claim is a real transaction, on mainnet, right now. And because this is the reward campaign, watch the balance. That's not a receipt. That's real Stark, moving, to a wallet that never touched the pool.

Here's the part that matters most. This check isn't Provah's word either. It's my own browser, reading straight off Starknet mainnet, independent of Provah's backend entirely. Anyone watching this, right now, could go verify the exact same thing themselves.
```

Total: roughly 250 words, about 100 seconds at a measured pace — trims to
under 90 seconds with slightly tighter delivery, which ElevenLabs' default
pacing usually lands close to on its own.
