-- Receipts, invoices, and quotes found through Connections are often PDFs.
-- They are kept in the same private evidence bucket, only once the owner applies a match.
update storage.buckets
set allowed_mime_types = array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'audio/wav', 'application/pdf']
where id = 'evidence';
