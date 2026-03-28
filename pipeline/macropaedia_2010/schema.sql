PRAGMA foreign_keys = ON;

CREATE TABLE project_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE volumes (
    volume_number INTEGER PRIMARY KEY,
    volume_label TEXT NOT NULL,
    contents_image_relative_path TEXT,
    contents_image_orientation TEXT,
    image_width INTEGER,
    image_height INTEGER,
    first_start_page_label TEXT,
    last_start_page_label TEXT,
    notes TEXT
);

CREATE TABLE articles (
    article_id INTEGER PRIMARY KEY,
    volume_number INTEGER NOT NULL REFERENCES volumes(volume_number) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL,
    start_page_label TEXT NOT NULL,
    start_page_index INTEGER NOT NULL,
    page_length INTEGER,
    macropaedia_contents_name TEXT NOT NULL,
    propaedia_name TEXT,
    propaedia_name_status TEXT NOT NULL DEFAULT 'missing'
        CHECK (propaedia_name_status IN ('missing', 'partial', 'confirmed')),
    propaedia_name_source_image_path TEXT,
    article_contents_image_status TEXT NOT NULL DEFAULT 'missing'
        CHECK (article_contents_image_status IN ('missing', 'partial', 'captured', 'reviewed')),
    propaedia_mapping_status TEXT NOT NULL DEFAULT 'missing'
        CHECK (propaedia_mapping_status IN ('missing', 'partial', 'confirmed')),
    britannica_mapping_status TEXT NOT NULL DEFAULT 'missing'
        CHECK (britannica_mapping_status IN ('missing', 'partial', 'confirmed')),
    notes TEXT,
    UNIQUE (volume_number, start_page_label)
);

CREATE TABLE images (
    image_id INTEGER PRIMARY KEY,
    image_kind TEXT NOT NULL
        CHECK (image_kind IN ('volume_contents', 'propaedia_page', 'article_contents')),
    relative_path TEXT NOT NULL UNIQUE,
    volume_number INTEGER REFERENCES volumes(volume_number),
    article_id INTEGER REFERENCES articles(article_id) ON DELETE CASCADE,
    linked_start_page_label TEXT,
    page_reference TEXT,
    rotation_degrees INTEGER,
    capture_status TEXT NOT NULL DEFAULT 'captured'
        CHECK (capture_status IN ('captured', 'reviewed', 'rejected')),
    notes TEXT
);

CREATE TABLE propaedia_mappings (
    mapping_id INTEGER PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    mapping_order INTEGER NOT NULL DEFAULT 1,
    part_number INTEGER,
    division_id TEXT,
    section_code TEXT,
    subsection_path TEXT,
    confidence TEXT NOT NULL DEFAULT 'draft'
        CHECK (confidence IN ('draft', 'probable', 'confirmed')),
    source_image_relative_path TEXT,
    notes TEXT
);

CREATE TABLE britannica_targets (
    target_id INTEGER PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    target_title TEXT NOT NULL,
    target_url TEXT,
    target_kind TEXT NOT NULL DEFAULT 'article'
        CHECK (target_kind IN ('article', 'topic_page', 'search_result', 'other')),
    confidence TEXT NOT NULL DEFAULT 'draft'
        CHECK (confidence IN ('draft', 'probable', 'confirmed')),
    source_image_relative_path TEXT,
    notes TEXT
);

CREATE VIEW article_overview AS
SELECT
    a.article_id,
    a.volume_number,
    a.sort_order,
    a.start_page_label,
    a.start_page_index,
    a.page_length,
    a.macropaedia_contents_name,
    a.propaedia_name,
    a.propaedia_name_status,
    a.article_contents_image_status,
    a.propaedia_mapping_status,
    a.britannica_mapping_status,
    COUNT(DISTINCT CASE WHEN i.image_kind = 'article_contents' THEN i.image_id END) AS article_contents_image_count,
    COUNT(DISTINCT pm.mapping_id) AS propaedia_mapping_count,
    COUNT(DISTINCT bt.target_id) AS britannica_target_count
FROM articles a
LEFT JOIN images i ON i.article_id = a.article_id
LEFT JOIN propaedia_mappings pm ON pm.article_id = a.article_id
LEFT JOIN britannica_targets bt ON bt.article_id = a.article_id
GROUP BY
    a.article_id,
    a.volume_number,
    a.sort_order,
    a.start_page_label,
    a.start_page_index,
    a.page_length,
    a.macropaedia_contents_name,
    a.propaedia_name,
    a.propaedia_name_status,
    a.article_contents_image_status,
    a.propaedia_mapping_status,
    a.britannica_mapping_status;

CREATE VIEW articles_needing_propaedia_name AS
SELECT *
FROM article_overview
WHERE propaedia_name IS NULL OR TRIM(propaedia_name) = '';

CREATE VIEW articles_needing_article_contents_images AS
SELECT *
FROM article_overview
WHERE article_contents_image_count = 0;

CREATE VIEW articles_needing_propaedia_mappings AS
SELECT *
FROM article_overview
WHERE propaedia_mapping_count = 0;

CREATE VIEW articles_needing_britannica_targets AS
SELECT *
FROM article_overview
WHERE britannica_target_count = 0;

CREATE VIEW last_articles_without_length AS
SELECT *
FROM article_overview
WHERE page_length IS NULL;
