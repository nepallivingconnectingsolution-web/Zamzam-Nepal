-- Google Sign-In (customers only): a Google sign-up has no phone number at
-- account-creation time, so `mobile` can no longer be NOT NULL. The unique
-- index on it is untouched — Postgres allows any number of NULLs under a
-- unique index, so real phone numbers still can't collide.
ALTER TABLE "users" ALTER COLUMN "mobile" DROP NOT NULL;
