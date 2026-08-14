# The Empey Effect — website

A simple, warm website for The Empey Effect: a homepage with your mission
and story, and a Community Feed page with a bulletin-board style thread for
quotes, good news, and volunteer opportunities, plus a photo wall. Only you
(or anyone you personally invite) can add posts and photos — everyone else
just views the site.

## What's in here

```
index.html          → Homepage
feed.html            → Community Feed + Photo Wall
css/style.css         → All styling
js/main.js            → Loads the feed & photos onto the page
content/feed.json     → The actual posts (edited via the admin panel)
content/photos.json   → The actual photos (edited via the admin panel)
images/               → Logo, hero photo, and uploaded photos
admin/                → The private admin panel (Decap CMS)
netlify.toml          → Netlify config
```

You will basically never need to hand-edit HTML/CSS again — once it's set
up, you add new quotes, news, volunteer posts, and photos through a simple
web form at `yoursite.netlify.app/admin`.

## Step 1 — Put this on GitHub

Netlify's admin login (Git Gateway) needs your site connected to a git
repository — this is what makes "only I can post" actually work.

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Create a new repository (e.g. `empey-effect`).
3. Upload all the files in this folder to that repository (drag-and-drop
   works fine on github.com — click **Add file → Upload files**).

## Step 2 — Deploy to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) and sign up (free).
2. Click **Add a new site → Import an existing project**, and connect it
   to the GitHub repo you just created.
3. Leave the build settings blank (there's nothing to build) and click
   **Deploy**.
4. Your site will go live at something like `random-name-123.netlify.app`.
   You can rename this under **Site configuration → Change site name**.

## Step 3 — Turn on the admin login (Netlify Identity + Git Gateway)

This is what makes the admin panel only accessible to you.

1. In your Netlify site dashboard, go to **Integrations → Identity** (or
   **Site configuration → Identity**) and click **Enable Identity**.
2. Under **Registration**, set it to **Invite only**. This is important —
   it stops strangers from signing themselves up.
3. Scroll to **Services → Git Gateway** and click **Enable Git Gateway**.
   This lets the admin panel save your posts back to GitHub for you,
   without you ever touching code.
4. Go to the **Identity** tab and click **Invite users**. Enter your own
   email address and send yourself the invite.
5. Check your email, click the invite link, and set a password.

Once that's done, open `yoursite.netlify.app/admin/` and log in — that's
your private posting panel. Nobody else can get in unless you invite them
the same way.

*(Optional but recommended: open `admin/config.yml` and replace the two
`YOUR-SITE-NAME.netlify.app` placeholders with your real Netlify URL.)*

## Step 4 — Add your first posts

In the admin panel:

- **Community Feed** → **Feed Posts** → add an entry for each quote, news
  story, or volunteer opportunity. Pick a type (Quote / News / Volunteer),
  a title, the text, an optional link, and a date.
- **Photo Wall** → **Photos** → upload an image and an optional caption.

Click **Publish** on each change — it appears on your live site within
about a minute.

## Making changes to the design later

If you (or someone helping you) ever want to tweak colors, fonts, or the
homepage story text, all of that lives in `index.html`, `feed.html`, and
`css/style.css` — plain HTML/CSS, no build tools required. Just edit the
files in GitHub (or re-upload edited versions) and Netlify will redeploy
automatically.

## Merch "coming soon" section

The homepage has a Merch section with your product photo and a simple
interest signup, so you can gauge demand before committing to an actual
store. When you're ready to actually sell shirts/mugs/bottles, swap the
photo in `index.html` for updated product shots, and connect a
print-on-demand service (like Printful or Bonfire) — happy to help wire
that up later.

## Private submissions (no public email needed)

Two forms on the site send straight to a private inbox that only you can
see — nobody's email address (yours or theirs) is ever shown publicly:

- **Merch interest** (homepage) — people can say they'd want a shirt/mug/
  bottle if you make it real.
- **Share Something** (Community Feed page) — anyone can send in a quote,
  a good-news story, a volunteer opportunity, or just a message, without
  needing an account or giving you their email.

Both use **Netlify Forms**, which is free and automatic — Netlify detects
them the moment you deploy. To check for new messages: go to your Netlify
site dashboard → **Forms**, and you'll see every submission listed there,
organized by form name ("merch-interest" and "community-submission").

**To get pinged the next time you log in, without putting your email
anywhere on the site itself:** in the Netlify dashboard, go to **Forms →
Notifications → Add notification → Email notification**, and enter your
email there. That address is stored privately in your Netlify account
settings — it's never displayed on the website, and visitors never see it.
You'll just get a quiet email the moment someone submits something, the
same way you'd get any other account notification.

If you'd rather skip email entirely, you can also just make it a habit to
check the **Forms** tab whenever you log into Netlify — the submissions
sit there until you've read them either way.

## A note on the free tier

Netlify Identity's free tier includes up to 5 active admin users and 1,000
logged-in actions/month — more than enough for one admin managing a
community page. If you ever want more people to help post, just invite
their email addresses the same way you invited yourself.
