# DDPP Resource Center — setup

Five files. Push to GitHub, Netlify deploys itself, paste one snippet into
Elementor once. No DNS changes.

```
index.html                     the page
netlify.toml                   config
netlify/functions/count.mjs    the Jotform proxy
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

## 2. Add the Jotform credentials

In Netlify: Site configuration > Environment variables > Add a variable.

| Key | Value |
|---|---|
| `JOTFORM_API_KEY` | from Jotform: Account > API > Create New Key. Set it to **read only**. |
| `JOTFORM_FORM_IDS` | the form ID, or several separated by commas: `2513…,2514…,2515…` |
| `JOTFORM_BASE` | only if your Jotform account is on EU servers: `https://eu-api.jotform.com` |

The form ID is the number in the form's URL: `jotform.com/form/251234567890123`.

Redeploy after adding variables (Deploys > Trigger deploy). Environment
variables only take effect on a fresh build.

Test it by visiting `https://your-site-name.netlify.app/api/count`. You should
see something like `{"count":0,"asOf":"..."}`. If you see an error, the key or
the form ID is wrong. If you see a 404, the function did not deploy — check
that the file is still named `count.mjs` and not `count.js`.

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
| Retailer logos | Program section, `.retailers` grid | Each tile is sized for a logo. Replace the brand name with `<img src="…" alt="Walmart">`; no other change needed. |
| Monthly call dates | Support section | Three `[date TBD]` entries. |

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

**The API key is read only for a reason.** A read-only Jotform key can still
pull full submission records, which contain family names and phone numbers.
That is exactly why the count goes through the function instead of the browser.
The key lives in Netlify's environment variables and never reaches the page or
this repo.

**The number says "applications submitted," not "families enrolled."** Jotform
counts submissions. A submission is not an enrollment until the family clicks
the verification text and the card issues, so this number will always run ahead
of the figure in your IDHS reporting. If you would rather the page show actual
enrollments, point the function at card issuance data instead of Jotform and
change `DD_LABEL` in `index.html` to `families enrolled`.

## Security headers

`netlify.toml` restricts who can iframe this page to modcollective.org. If you
want it embedded on a Compago site too, add that domain to the
`frame-ancestors` line.

## If you ever want it on a MOD subdomain

Netlify: Domain management > Add a domain > `ddpp.modcollective.org`, then add
the CNAME record it gives you at your DNS host. Netlify issues the certificate
automatically. Nothing in this repo changes, but update the two `YOUR-SITE-NAME`
URLs in `embed-snippet.html` and re-paste it into Elementor.
