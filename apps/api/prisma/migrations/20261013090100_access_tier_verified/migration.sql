-- M16: a fourth answer to "who may see this": anyone the platform knows as a physician, whether
-- or not they belong to an organisation. A new value of an enum cannot be used in the migration
-- that adds it, so it stands alone; the next migration uses it.
ALTER TYPE "access_tier" ADD VALUE 'VERIFIED' BEFORE 'MEMBERS';
