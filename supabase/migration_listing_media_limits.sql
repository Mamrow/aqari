-- Aqari — put a ceiling and a type filter on the listing-photos bucket.
-- Run once in the SQL Editor.
--
-- The bucket was created with neither (see schema.sql), and its insert policy
-- is "any signed-in session" — which it has to be, since Storage can't check
-- owner_id on a row that doesn't exist yet. Together that made any account
-- able to push arbitrary files of any type, at the project's global size
-- limit, into a bucket that serves them publicly over HTTP. Nothing in the
-- app uploads anything but listing photos, listing videos and avatars.
--
-- Wildcards rather than an exact list of codecs: the app derives a video's
-- content type from the file extension the picker hands it
-- (src/utils/uploadImage.js), so an exact list would reject a legitimate
-- recording from some phone on a Tuesday. 'image/*' and 'video/*' still shut
-- out the actual abuse — archives, executables, HTML served from your own
-- domain.
--
-- 50 MB matches MAX_VIDEO_BYTES in src/utils/uploadImage.js, which rejects an
-- oversized clip before the upload starts. Change both together, or the app
-- spends minutes uploading something the bucket will refuse.

update storage.buckets
set file_size_limit = 52428800, -- 50 MB
    allowed_mime_types = array['image/*', 'video/*']
where id = 'listing-photos';

-- Verify:
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'listing-photos';
