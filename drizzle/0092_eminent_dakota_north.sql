CREATE UNIQUE INDEX "document_chunks_doc_chunk_idx" ON "document_chunks" USING btree ("document_uuid","chunk_index");
