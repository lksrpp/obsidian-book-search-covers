# How to Get a Google Books API Key

*Last updated: 10 June 2026*

This guide walks you through getting a **free** Google Books API key, step by step. You don't need any technical knowledge, just a Google account (the same one you use for Gmail) and about 5 minutes.

> **What is an API key?**
> Think of it like a personal library card. It's a long string of letters and numbers that tells Google "this is me" when the plugin looks up book information. It's free, and it lets you search for far more books without running into limits.

---

## What you'll need

- A Google account (e.g. a Gmail address). If you don't have one, you can [create one here](https://accounts.google.com/signup).
- A web browser.

---

## Step 1 — Open the Google Cloud Console

1. Go to **[https://console.cloud.google.com](https://console.cloud.google.com)**.
2. Sign in with your Google account if you're asked to.
3. If this is your first time, you may see a welcome screen asking you to agree to the Terms of Service. Tick the box and click the button to continue (often labelled **Agree and Continue**).

> Don't worry, "Google Cloud" sounds technical, but you won't be charged anything. The Google Books API is free to use.

---

## Step 2 — Create a project

A "project" is just a folder where Google keeps your key. You only need to do this once.

1. At the very top of the page, click the **project dropdown** (it's next to the "Google Cloud" logo and might say "Select a project").
2. In the window that pops up, click **New Project** (top right).
3. Give it any name you like, for example `Book Covers`.
4. Click **Create**.
5. Wait a few seconds. When it's ready, make sure your new project is selected in that same dropdown at the top.

---

## Step 3 — Turn on the Books API

Now we tell Google you want to use the Books service.

1. In the search bar at the top of the page, type **Books API**.
2. Click **Books API** in the results.
3. Click the blue **Enable** button.
4. Wait a moment while it switches on.

---

## Step 4 — Create your API key

1. In the search bar at the top, type **Credentials** and click **Credentials** (under "APIs & Services").
2. Near the top, click **+ Create Credentials**.
3. Choose **API key** from the menu.
4. A box will pop up showing your brand-new key, a long line of letters and numbers.
5. Click the **copy** icon to copy it.

🎉 **That's it!** You now have your Google Books API key.

---

## Step 5 — Paste it into the plugin

1. Open Obsidian.
2. Go to **Settings → Book Search + Covers**.
3. Paste your key into the **Google Books API key** field.
4. You're ready to search for books and covers!

---

## Keeping your key safe

- **Treat your key like a password.** Don't post it publicly or share it in screenshots.
- You don't need to memorise it. If you ever lose it, you can come back to the **Credentials** page (Step 4) and copy it again.

---

## Frequently asked questions

**Is this really free?**
Yes. The Google Books API has a generous free daily limit (currently around 1,000 searches a day), which is far more than personal use needs. You will not be asked for a credit card just to create a key.

**Do I have to do this?**
Yes. This plugin needs a key to search Google Books, so it's a one-time setup before your first search. The good news: it's free and takes about 5 minutes.

**I closed the window and lost my key. What now?**
No problem. Go back to **Credentials** (Step 4), find your key in the list, click on it, and copy it again.

**Something looks different from the screenshots / steps.**
Google occasionally changes how their website looks. The general flow — create a project, enable the Books API, create an API key — stays the same. If you get stuck, the wording you're looking for is usually "Credentials" and "API key".

---

*If you still have open questions, let me know, so I can update it.*
