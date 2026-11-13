"""Publish approved, due carousel posts. All external writes require live mode."""
import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]

def api(method, url, token, data=None):
    body = None if data is None else urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method=method,
        headers={'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        # Only log numeric diagnostic fields, never Meta's message or token.
        detail = ''
        try:
            error = json.load(exc).get('error', {})
            for field in ('code', 'error_subcode'):
                value = error.get(field)
                if isinstance(value, int):
                    detail += f' {field}={value}'
        except (ValueError, AttributeError):
            pass
        path = urllib.parse.urlsplit(url).path
        raise RuntimeError(f'Meta request {method} {path} rejected (HTTP {exc.code}{detail}). Check the saved Page token and permissions.') from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError('API connection failed; a publishing result may be uncertain. Check the account before retrying.') from None
    if 'error' in result:
        raise RuntimeError('API returned an error; check account permissions.')
    return result

def required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError(f'Missing secret or variable: {name}')
    return value

def validate(post):
    if not re.fullmatch(r'[a-z0-9-]{1,80}', post.get('id', '')):
        raise ValueError('Post ID must use lowercase letters, digits and hyphens.')
    when = datetime.fromisoformat(post['scheduled_at'])
    if when.tzinfo is None:
        raise ValueError('scheduled_at must include a timezone, such as +07:00.')
    platforms = post.get('platforms', [])
    if not platforms or len(platforms) != len(set(platforms)) or set(platforms) - {'facebook', 'instagram'}:
        raise ValueError('Choose facebook, instagram or both once.')
    if not isinstance(post.get('caption'), str) or not post['caption'].strip():
        raise ValueError('Caption is required.')
    if 'instagram' in platforms and len(post['caption']) > 2200:
        raise ValueError('Instagram caption exceeds 2,200 characters.')
    urls = post.get('images', [])
    if not 2 <= len(urls) <= 10:
        raise ValueError('Use 2–10 ordered images for this carousel publisher.')
    for url in urls:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Images require public HTTPS URLs without embedded credentials.')
    return when

def due_posts(queue, now):
    seen = set()
    result = []
    for post in queue:
        when = validate(post)
        if post['id'] in seen:
            raise ValueError('Duplicate post ID in queue.')
        seen.add(post['id'])
        if post.get('approved') is True and when <= now:
            result.append(post)
    return result

class Ledger:
    """Persist each reservation before publishing, and each receipt afterward."""
    def __init__(self):
        self.path = ROOT / 'state.json'
        self.state = json.loads(self.path.read_text())

    def save(self):
        # A durable repository checkpoint prevents retries after an uncertain POST.
        repo = required('GITHUB_REPOSITORY')
        branch = os.environ.get('GITHUB_REF_NAME', 'main')
        url = f'https://api.github.com/repos/{repo}/contents/state.json'
        token = required('GITHUB_TOKEN')
        get = urllib.request.Request(url + '?ref=' + urllib.parse.quote(branch),
              headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json'})
        with urllib.request.urlopen(get, timeout=30) as response:
            current = json.load(response)
        text = json.dumps(self.state, ensure_ascii=False, indent=2) + '\n'
        data = json.dumps({'message': 'Record publisher checkpoint', 'branch': branch,
            'sha': current['sha'], 'content': base64.b64encode(text.encode()).decode()}).encode()
        req = urllib.request.Request(url, data=data, method='PUT', headers={
            'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json'})
        with urllib.request.urlopen(req, timeout=30) as response:
            json.load(response)
        self.path.write_text(text)

    def reserve(self, key):
        if key in self.state:
            return False
        self.state[key] = {'status': 'publishing', 'started_at': datetime.now(timezone.utc).isoformat()}
        self.save()  # Do not send Meta any publishing request if persistence fails.
        return True

    def finish(self, key, receipt):
        self.state[key] = {'status': 'published', 'receipt': receipt,
            'published_at': datetime.now(timezone.utc).isoformat()}
        self.save()

def graph(path, token, data=None):
    version = os.environ.get('META_GRAPH_VERSION', 'v27.0')
    if not re.fullmatch(r'v\d+\.\d+', version):
        raise ValueError('Invalid Graph API version.')
    return api('GET' if data is None else 'POST', f'https://graph.facebook.com/{version}/{path}', token, data)

def connection(token, platforms):
    page_id = required('FB_PAGE_ID')
    result = graph('me?fields=id,name', token)
    if result.get('id') != page_id:
        raise ValueError('META_PAGE_TOKEN must identify the configured Facebook Page, not your personal account.')
    if 'instagram' in platforms:
        ig = required('IG_ACCOUNT_ID')
        linked = graph(page_id + '?fields=instagram_business_account', token)
        if linked.get('instagram_business_account', {}).get('id') != ig:
            raise ValueError('Configured Instagram account is not linked to this Page.')
        graph(ig + '?fields=id,username', token)
    print('Account connection verified. No tokens are printed.')

def facebook(post, token):
    page = required('FB_PAGE_ID')
    media = []
    for url in post['images']:
        result = graph(page + '/photos', token, {'url': url, 'published': 'false'})
        media.append({'media_fbid': result['id']})
    return graph(page + '/feed', token, {'message': post['caption'], 'attached_media': json.dumps(media)})

def instagram(post, token):
    account = required('IG_ACCOUNT_ID')
    children = [graph(account + '/media', token,
        {'image_url': url, 'is_carousel_item': 'true'})['id'] for url in post['images']]
    container = graph(account + '/media', token, {'media_type': 'CAROUSEL',
        'children': ','.join(children), 'caption': post['caption']})['id']
    for _ in range(5):
        status = graph(container + '?fields=status_code', token).get('status_code')
        if status == 'FINISHED':
            return graph(account + '/media_publish', token, {'creation_id': container})
        if status in {'ERROR', 'EXPIRED', 'PUBLISHED'}:
            raise RuntimeError('Instagram container is not publishable; inspect account before resetting ledger.')
        time.sleep(60)
    raise RuntimeError('Instagram preparation timed out; no automatic retry will be attempted.')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['dry-run', 'check', 'live'], default='dry-run')
    args = parser.parse_args()
    queue = json.loads((ROOT / 'queue.json').read_text())
    due = due_posts(queue, datetime.now(timezone.utc))
    if args.mode == 'dry-run':
        print(f'Queue valid: {len(queue)} posts; {len(due)} approved and due. No network calls or posts made.')
        for post in due:
            print(post['id'], ','.join(post['platforms']), len(post['images']), 'images')
        return
    token = required('META_PAGE_TOKEN')
    if args.mode == 'check':
        connection(token, {'facebook', 'instagram'})
        return
    if os.environ.get('AUTO_POST_ENABLED') != 'true':
        raise ValueError('Set AUTO_POST_ENABLED=true only after reviewing queue and credentials.')
    connection(token, {p for post in due for p in post['platforms']})
    ledger = Ledger()
    for post in due:
        for platform in post['platforms']:
            key = post['id'] + ':' + platform
            if not ledger.reserve(key):
                print('Skipped existing or uncertain attempt:', key)
                continue
            # Never blindly retry these operations: Meta can publish before a timeout.
            receipt = (facebook if platform == 'facebook' else instagram)(post, token)
            ledger.finish(key, receipt)
            print('Published:', key, 'ID:', receipt.get('id', 'see ledger'))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not log API response bodies/URLs, which may contain credentials.
        print('Publisher stopped:', str(exc) if isinstance(exc, (ValueError, RuntimeError)) else type(exc).__name__, file=sys.stderr)
        sys.exit(1)
