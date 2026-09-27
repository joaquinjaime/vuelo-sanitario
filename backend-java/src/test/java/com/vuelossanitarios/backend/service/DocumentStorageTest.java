package com.vuelossanitarios.backend.service;

import com.vuelossanitarios.backend.api.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class DocumentStorageTest {
    @TempDir Path directory;
    @Test void storesOnlyPdfMagicBytesInsideConfiguredDirectory() {
        DocumentStorage storage = new DocumentStorage(directory.toString(), 1024);
        String key = storage.storePdf(new MockMultipartFile("file", "../safe.pdf", "application/pdf", "%PDF-1.7".getBytes()));
        assertArrayEquals("%PDF-1.7".getBytes(), storage.read(key).bytes());
        assertThrows(ApiException.class, () -> storage.storePdf(new MockMultipartFile("file", "bad.pdf", "application/pdf", "not pdf".getBytes())));
    }
}
