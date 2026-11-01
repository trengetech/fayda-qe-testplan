# Generates db/seed.sql from the plan below (the plan comes from docs/DEMO_SCRIPT.md in the Fayda repo, 1 Nov 2026).
import sys
P = [
 ("Before you start", [
  ("Install both internal APKs", "- **Seller app (phone A):** [Download the seller APK](downloads/fayda-seller-dev-0.1.0-phone.apk) (38 MB)\n- **Buyer app (phone B):** [Download the buyer APK](downloads/fayda-buyer-dev-0.1.0-phone.apk) (33 MB)\n- On the phone: open the link, allow \"Install unknown apps\" for your browser when asked, install, then allow notifications.\n- For 64-bit ARM phones (almost every phone sold since 2017). Both apps talk to the dev server https://fayda.140-245-219-163.sslip.io. Checksums are in [SHA256SUMS.txt](downloads/SHA256SUMS.txt).", "Both apps open and show a \"Prototype\" banner."),
  ("Demo data (not required: already set up)", "**Not required.** The demo data is already on the dev server, so there is nothing to install or run:\n- 3 shops with 9 live listings\n- 2 buyers\n- 4 orders (2 delivered, 2 waiting for the seller)\n\nThe people and phone numbers are in the next test case.", "Nothing to do. Mark Skip."),
  ("Sign in on both phones", "The sign-in code for every number is **123456** (simulated OTP).\n\n**Use these two:**\n- **Phone A, Seller app:** 9000011111, Indigo Threads (UPI, bargaining on)\n- **Phone B, Buyer app:** 9876543210, Aarav Sharma\n\n**Other people in the demo:**\n- Seller 2: 9000033333, Loom & Co.\n- Seller 3: 9000022222, Meher's Closet\n- Buyer 2: 9123456789, Priya Nair (has an order waiting for the seller)", "Both phones are signed in. What one does, the other sees within a few seconds."),
 ]),
 ("Part 1: browse and buy at the listed price (3 min)", [
  ("Open the feed and a fixed-price listing", "B: open the feed. Open Mul cotton shirt (Loom & Co., fixed price).", "Nine listings appear. The shirt has no offer button, only buy."),
  ("Buy at the listed price", "B: pick a size, tap buy (the saved address is already selected). Open the order screen.", "The order shows the seller's payment details (UPI ID, \"Pay in a UPI app\"). With no UPI app installed the app says so instead of failing."),
  ("Explain who handles the money", "Say: Fayda never takes the money. The buyer pays the seller directly and the seller moves the order forward.", "Nothing in either app takes or holds payment."),
 ]),
 ("Part 2: bargaining, the seller's private rules (5 min)", [
  ("Show the seller's private rules", "Use Hand-block printed cotton kurta (₹2,499). Private rules: accept at ₹2,199 or more, counter at ₹2,299. A: open the kurta in the seller app and show the private rules.", "Only the seller sees the rules. The buyer app never shows them."),
  ("Offer ₹1,500 and get a counter", "B: open the kurta, Make an offer of ₹1,500.", "After about 5 seconds a counter arrives (₹2,299) that looks like the seller's own reply. The buyer cannot tell it was automatic."),
  ("Counter or accept; seller sees the timeline", "B: counter or accept. A: look at the offers inbox.", "The offer shows in the seller's inbox with the whole timeline."),
  ("Offer ₹2,250 on another size", "B: offer ₹2,250 on another size of the kurta.", "Accepted automatically: \"Agreed at ₹2,250. One unit is held for you for 12 h.\""),
  ("Place the order from the agreed price", "B: place the order from the agreed price.", "The order is placed at ₹2,250."),
  ("Offer below the decline line", "Chanderi silk kurta set (₹4,899, decline below ₹3,500): B offers ₹2,000.", "Declined after about 2 minutes."),
  ("Explain the idea", "Say: the seller sets the rules once; the buyer sees a conversation.", "The buyer never sees that a reply was automatic."),
 ]),
 ("Part 3: the seller moves the order (3 min)", [
  ("Two orders are waiting", "A: open Orders.", "Two orders wait: Priya's (seeded) and the new one from Aarav."),
  ("Confirm, ship and deliver; the buyer only views", "A: confirm one (add shipping details if wanted), then mark it delivered. B: watch the order status.", "The buyer's order status changes. The buyer cannot move the order."),
  ("Push notification, app closed", "B: close the buyer app completely (swipe it away from recents; do NOT force-stop). On A, confirm another order.", "A push arrives on B. Tapping it opens that order. (Push to a physical phone has not been confirmed yet.)"),
  ("Shop record and dashboard", "A: open the shop record and the dashboard.", "Record shows delivered, total and median time to confirm. Dashboard shows the last 7 and 30 days."),
 ]),
 ("Part 4: chat, comments, safety (3 min)", [
  ("Order chat", "B: in the order, open the chat and send a message.", "A sees it within seconds."),
  ("Comment and shop reply", "B: on the kurta, post a comment. A: open the notification, then reply as the shop.", "A gets a notification; tapping opens the comments. The reply shows as the shop."),
  ("Report and block", "B: on a comment from someone else, Report (pick a reason) and Block. Then open Blocked people.", "The blocked person's comments disappear from B's list. Blocked people lists them with Unblock."),
 ]),
 ("Part 5: one identity (1 min)", [
  ("Same number, both apps", "Sign in on phone B to the Seller app with 9876543210. Then sign out again.", "The same person signs in to both apps (a buyer who can also open a shop). The push token is removed on sign-out."),
 ]),
 ("Reset", [
  ("Return to a clean demo", "Run the unseed command, then the seed command again. Do this before each run.", "Demo data is back to the clean state."),
 ]),
]
def q(s): return "$q$" + s + "$q$"
out = ["-- Generated by db/plan.py. Adds the starting plan only when there are no steps yet, so running it again is harmless.", "insert into qe.steps (section, section_pos, pos, title, detail, expected, created_by, updated_by)", "select * from (values"]
rows = []
for si, (sec, steps) in enumerate(P):
    for pi, (t, d, e) in enumerate(steps):
        rows.append(f"  ({q(sec)}::text, {si}, {pi}, {q(t)}::text, {q(d)}::text, {q(e)}::text, 'seed'::text, 'seed'::text)")
out.append(",\n".join(rows))
out.append(") as v(section, section_pos, pos, title, detail, expected, created_by, updated_by)\nwhere not exists (select 1 from qe.steps);")
open('db/seed.sql','w').write("\n".join(out)+"\n")
print(len(rows), "steps")
