# DDPP Resource Center — setup

Five files. Push to GitHub, Netlify deploys itself, paste one snippet into
Elementor once. No DNS changes.

```
index.html                     the page
netlify.toml                   config
netlify/functions/count.mjs    reads the published Feed tab
embed-snippet.html             what goes on the MOD page
.gitignore                     keeps secrets and OS cruft out of the repo
```

## How updates work

This folder is a git repository connected to Netlify. Push a commit and Netlify
rebuilds the live page in about 30 seconds. The MOD site is never touched again
after the one-time embed in step 3.

```
edit files  ->  git commit  ->  git push  ->  Netlify builds  ->  live
```

Every change is dated and revertable. If an edit breaks something,
`git revert` puts it back.

## 1. Connect the repo to Netlify

Create an empty private repo on github.com (no README, no .gitignore — this
folder already has both), then from this folder:

```
git remote add origin https://github.com/YOUR-USERNAME/ddpp-resource-center.git
git push -u origin main
```

In Netlify: Add new site > Import an existing project > GitHub, and pick the
repo. Netlify reads `netlify.toml`, so leave the build settings alone — build
command empty, publish directory `.`.

Rename the site under Site configuration > Change site name. Something like
`modcollective-ddpp`, so the URL becomes `modcollective-ddpp.netlify.app`.

## 2. The counter

**Nothing to configure in Netlify.** There is no API key and no environment
variable. The counter reads a published Google Sheet.

How the number gets there:

```
Jotform  ->  Client Log workbook  ->  Apps Script  ->  published Feed tab  ->  /api/count
```

`DDPP-Dashboard.gs` (in the parent folder, not this repo) runs inside the
workbook. It counts rows where `bs_status` is `Completed`, builds a Dashboard
tab for people and a Feed tab of one header row and one data row, and refreshes
hourly and whenever Jotform adds a row.

Only the **Feed** tab is published — File > Share > Publish to web > *Feed* >
CSV. Never publish "Entire document": the log tabs carry caregiver IDs.

The function reads that CSV and returns `{"count":23,"unit":"households",
"goal":5500,"asOf":"..."}`. The page takes the unit and the goal from the feed,
so changing the goal in the Apps Script changes the site.

If the sheet is ever republished at a new URL, either update `FEED_URL` in
`netlify/functions/count.mjs` or set `DDPP_FEED_URL` in Netlify.

Test it at `https://ddpp-resource-center.netlify.app/api/count`. A 502 means the
feed is unreachable; a 404 means the function did not deploy, so check the file
is still named `count.mjs` and not `count.js`.

## 3. Embed it

Open `embed-snippet.html`, replace both instances of `YOUR-SITE-NAME` with your
Netlify subdomain, and paste the whole thing into an Elementor HTML widget on
the MOD page. Set the containing section to full width with no padding.

The iframe resizes itself as staff move between sections, so you do not need to
guess a height.

This is the only time the MOD site is edited. Content changes after this happen
through git and appear inside the existing iframe automatically.

## Still to fill in

| What | Where | Notes |
|---|---|---|
| Four training video links | Support section, `.video` blocks | The tiles render but nothing is clickable yet. |
| Monthly call dates | Support section | Three `[date TBD]` entries. |
| Fresh card screenshots | `img/` | Current ones show the old offer label "$40 IL WIC Diaper Support". Retake after the label changes to "Diaper Support". |

### The retailer grid

Deliberately name blocks, not logos. Retailer logos are trademarks and clean
licensed artwork was not worth chasing for twelve tiles. If that changes, the
list lives in the Program section under "Where the card works"; keep the
twelve names and the three "Online too" badges in sync with the card platform.

### About the screenshots in `img/`

They come from a demo card that has a live offer attached, so the card
number and the barcodes are masked before publishing. Only the first four
digits are visible. If you replace these images, redact the same things: the
barcode encodes the full card number, so masking the printed digits alone
accomplishes nothing.

### The two support numbers

| Number | Handles | Who calls it |
|---|---|---|
| 888-253-5667 | Card access, declined payments at the register | Families. It is printed on the card. |
| 844-663-2655 | The program, enrollment, lost enrollment links | Site staff, and families with program questions. |

Getting these backwards sends a family with a checkout problem to a line
that cannot help them mid-transaction.

Enrollment links are deliberately **not** listed anywhere on the page. They are
site specific, and a family enrolled through the wrong site's form is credited
to that site, which corrupts the WIC-versus-home-visiting comparison this pilot
year exists to measure. Staff who lose their link are pointed to their site
coordinator or to support. Do not add them "for convenience."

## Why the function is a .mjs file

Netlify runs functions as ES modules. A `.js` file using `export default`
needs `"type": "module"` declared in a `package.json`; naming it `.mjs`
removes the ambiguity without adding a package file. Do not rename it back.

## Two things to decide

**No credential exists in this path.** The counting happens inside the
workbook, and only aggregates are published. Nothing the site can reach could
return a submission record even if it were compromised. That is a stronger
position than the read-only API key this originally used, because a read-only
Jotform key can still pull full submissions.

What that trades away: anyone with the published CSV URL can see the totals.
They are counts of enrollments by program, which is not sensitive. Keep the
caregiver IDs out of anything published and this stays true.

**The number counts households, not children — for now.** The goal is 5,500
children, but "Number of Children under 3" is not yet in the Jotform to Sheets
field mapping, so the workbook can only count enrollments. The page says which
it is showing rather than comparing two different units silently.

Add that column to the Jotform integration and it fixes itself: the Apps Script
looks for any header mentioning "child", switches the Feed's `unit` to
`children`, and the page relabels. No code change. It cannot be backfilled for
rows already written, so it is worth doing before enrollment volume builds.

## Security headers

`netlify.toml` restricts who can iframe this page to modcollective.org. If you
want it embedded on a Compago site too, add that domain to the
`frame-ancestors` line.

## If you ever want it on a MOD subdomain

Netlify: Domain management > Add a domain > `ddpp.modcollective.org`, then add
the CNAME record it gives you at your DNS host. Netlify issues the certificate
automatically. Nothing in this repo changes, but update the two `YOUR-SITE-NAME`
URLs in `embed-snippet.html` and re-paste it into Elementor.
