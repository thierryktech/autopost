import importlib.util
from pathlib import Path
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).parents[1]/'scripts/publish.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)

def example(**kwargs):
    post = dict(id='claude-intro-001', approved=True, scheduled_at='2026-11-13T14:00:00+07:00',
        caption='Thai education', platforms=['facebook','instagram'],
        images=['https://example.com/01.jpg','https://example.com/02.jpg'])
    post.update(kwargs); return post

class PublisherTests(unittest.TestCase):
    def test_bangkok_due_and_unapproved(self):
        now=datetime(2026,11,13,7,0,tzinfo=timezone.utc)
        self.assertEqual(len(p.due_posts([example()],now)),1)
        self.assertEqual(p.due_posts([example(approved=False)],now),[])
        self.assertEqual(p.due_posts([example(scheduled_at='2026-11-14T14:00:00+07:00')],now),[])
    def test_missing_timezone_rejected(self):
        with self.assertRaises(ValueError): p.validate(example(scheduled_at='2026-11-13T14:00:00'))
    def test_media_credentials_rejected(self):
        with self.assertRaises(ValueError): p.validate(example(images=['https://secret:token@example.com/1.jpg']*2))
    def test_duplicate_ids_rejected(self):
        with self.assertRaises(ValueError): p.due_posts([example(),example()],datetime.now(timezone.utc))
    def test_uncertain_attempt_not_retried(self):
        ledger=p.Ledger.__new__(p.Ledger)
        ledger.state={'post:facebook':{'status':'publishing'}};ledger.save=Mock()
        self.assertFalse(ledger.reserve('post:facebook'));ledger.save.assert_not_called()
    def test_reservation_persisted_before_send(self):
        ledger=p.Ledger.__new__(p.Ledger);ledger.state={};ledger.save=Mock(side_effect=RuntimeError('storage failed'))
        with self.assertRaises(RuntimeError): ledger.reserve('post:facebook')

if __name__=='__main__': unittest.main()
