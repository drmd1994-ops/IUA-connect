-- M25: search over posts and comments, kept up to date by triggers as for news (M7).

ALTER TABLE "posts" ADD COLUMN "search_vector" tsvector;
ALTER TABLE "post_comments" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION posts_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('simple', normalize_he(coalesce(NEW.body, ''))), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER posts_search_vector
  BEFORE INSERT OR UPDATE OF "title", "body" ON "posts"
  FOR EACH ROW EXECUTE FUNCTION posts_search_vector();
CREATE INDEX "posts_search_idx" ON "posts" USING GIN ("search_vector");

CREATE FUNCTION post_comments_search_vector() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector := setweight(to_tsvector('simple', normalize_he(coalesce(NEW.body, ''))), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER post_comments_search_vector
  BEFORE INSERT OR UPDATE OF "body" ON "post_comments"
  FOR EACH ROW EXECUTE FUNCTION post_comments_search_vector();
CREATE INDEX "post_comments_search_idx" ON "post_comments" USING GIN ("search_vector");
