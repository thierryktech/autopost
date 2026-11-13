# Balena Studio Publisher

Scheduled Facebook multi-photo and Instagram carousel publishing using GitHub Actions. The queue starts empty and automatic posting starts disabled.

## 1. Add the secret

Repository Settings → Secrets and variables → Actions → Secrets → New repository secret.

- Name: `META_PAGE_TOKEN`
- Value: the Page access token for Page `1333518183169362`, confirmed by `GET me?fields=id,name` returning the Page identity. Never use the personal User token here.

Never commit tokens or app secrets. The repository is public: queue captions, media URLs and state receipts are public too. Store only content intended for publication.

## 2. Test without posting

Actions → Balena Publisher → Run workflow → select `main` and `dry-run`. This checks the queue without network calls or secrets.

Then run mode `check`. This reads the Facebook Page identity and linked Instagram account `17841429807921077`. It does not publish. A successful connection check does not prove Meta will accept a publish request; app access levels and media validation still apply.

## 3. Queue a reviewed post

Edit `queue.json` to contain an array of posts like this:

```json
[
  {
    "id": "claude-beginner-001",
    "approved": false,
    "scheduled_at": "2026-12-01T09:00:00+07:00",
    "platforms": ["facebook", "instagram"],
    "caption": "Your reviewed Thai caption",
    "images": [
      "https://YOUR_PUBLIC_MEDIA_HOST/01.jpg",
      "https://YOUR_PUBLIC_MEDIA_HOST/02.jpg"
    ]
  }
]
```

Use a new permanent ID for each post. Add all seven images in order. Replace the example date and URLs. Images must be publicly fetchable HTTPS JPEGs for Instagram, with a consistent supported aspect ratio; 1080 × 1350 is the intended export. Local files, sandbox links, private Drive viewer pages and PNGs are not suitable Instagram image URLs. Do not put tokens in image URLs. The publisher accepts 2–10 images per post; it handles the media upload and final publication separately on each network.

Set `approved` to `true` only after reviewing content, image order, account and time. ISO timestamps must include a timezone; `+07:00` is Bangkok. A missed schedule remains due and can publish on the next run.

## 4. Enable publishing

Settings → Secrets and variables → Actions → Variables → New repository variable:

- Name: `AUTO_POST_ENABLED`
- Value: `true`

Before enabling, inspect the entire queue: every approved post with a past timestamp is eligible. Manual mode `live` also requires this variable. Turn it off by setting it to `false`.

The workflow checks due posts hourly at minute 17 UTC (also minute 17 in Bangkok). This is a queue check, not a guarantee of exact posting time. GitHub may delay scheduled runs and disables schedules in public repos after 60 days without repository activity. Scheduled workflows run on the default branch. No post is made unless it is both approved and due.

## Duplicate and failure handling

Before any publishing attempt, the script commits a `publishing` reservation to `state.json` using the workflow's GitHub token. After Meta returns success, it saves the returned ID as `published`. Existing reservations are skipped on reruns, including uncertain attempts. A per-workflow concurrency group prevents overlapping runs.

If Meta succeeds but the response or final state save fails, check the actual social account before doing anything else. Do not delete the ledger entry and retry blindly. Record a known published ID in the entry, or remove only the failed platform entry after confirming no post was published. Facebook and Instagram receipts are independent, so a successful platform is not repeated when the other fails.

GitHub Actions requires `contents: write` to persist checkpoints. If repository policies prevent state writes, publishing stops before the first attempt. Do not overwrite `state.json` or reuse post IDs. This reduces duplicate risk; it cannot provide transactional exactly-once delivery across Meta and GitHub.

## Scope

This publishes finished, approved images and captions. It does not automatically invoke ChatGPT image generation, research topics, or regenerate content. Those steps remain in the content-production workflow. Token validity and data-access expiry must still be monitored; an expiry value of Never is not a guarantee that credentials cannot be revoked.

## Validation

```sh
python -m unittest discover -s tests -v
python scripts/publish.py --mode dry-run
```

Primary documentation:
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://developers.facebook.com/docs/graph-api/reference/page/feed/
- https://developers.facebook.com/docs/graph-api/reference/photo/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/

No live publishing has been tested during setup. Add the secret, run the connection check, then review the first queue item.
