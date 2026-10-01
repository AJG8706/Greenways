-- KMZ joins the document types the bucket accepts (zipped KML — the other
-- format surveyors hand over). Geometry imports parse KMZ server-side; this
-- covers the Documents card storing the original file.
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/vnd.google-earth.kmz')
where id = 'property-photos'
  and not ('application/vnd.google-earth.kmz' = any(allowed_mime_types));
