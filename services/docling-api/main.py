"""
Docling Document Processing Service

A lightweight FastAPI service that wraps IBM's Docling library for
advanced document processing. Handles PDF, DOCX, PPTX, XLSX, images,
and more with superior layout understanding, table extraction, and
structure preservation.

Author: Document Chat System
License: MIT
"""

import os
import io
import tempfile
import base64
import secrets
import threading
from functools import lru_cache
from starlette.concurrency import run_in_threadpool
from typing import Optional, Dict, Any, List
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions

# PDF to Image conversion
import fitz  # PyMuPDF

# Initialize FastAPI app
app = FastAPI(
    title="Docling Document Processing API",
    description="Advanced document processing service using IBM Docling",
    version="1.0.0"
)

# CORS configuration for Next.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def require_worker_token(request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    token = os.getenv("DOCLING_API_TOKEN")
    if not token:
        if os.getenv("DOCLING_ALLOW_UNAUTHENTICATED_LOCAL", "false").lower() != "true":
            return JSONResponse(status_code=503, content={"error": "Private worker authentication is not configured"})
    elif not secrets.compare_digest(request.headers.get("authorization", ""), f"Bearer {token}"):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    return await call_next(request)

_conversion_lock = threading.Lock()

@lru_cache(maxsize=1)
def get_converter(ocr_enabled=False, extract_tables=True, extract_images=True):
    options = PdfPipelineOptions()
    options.do_ocr = ocr_enabled
    options.do_table_structure = extract_tables
    options.generate_picture_images = extract_images
    return DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})

def convert_local_document(path, ocr_enabled, extract_tables, extract_images):
    # Bound memory and avoid concurrent use of mutable model instances.
    with _conversion_lock:
        return get_converter(ocr_enabled, extract_tables, extract_images).convert(path)

class ProcessingOptions(BaseModel):
    """Options for document processing"""
    export_format: str = Field(default="markdown", description="Output format: markdown, json, or html")
    ocr_enabled: bool = Field(default=True, description="Enable OCR for scanned documents")
    extract_tables: bool = Field(default=True, description="Extract table structures")
    extract_images: bool = Field(default=True, description="Extract embedded images")
    preserve_layout: bool = Field(default=True, description="Preserve document layout")


class ProcessingResponse(BaseModel):
    """Response from document processing"""
    success: bool
    content: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    sections: Optional[List[Dict[str, Any]]] = None
    tables: Optional[List[Dict[str, Any]]] = None
    images: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    processing_time_ms: Optional[int] = None


@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": "Docling Document Processing API",
        "version": "1.0.0",
        "status": "running",
        "supported_formats": [
            "PDF", "DOCX", "PPTX", "XLSX",
            "HTML", "Images (PNG, JPEG, TIFF)",
            "Audio (WAV, MP3)", "VTT"
        ]
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "docling-api",
        "docling_version": "1.0.0"
    }


@app.post("/process", response_model=ProcessingResponse)
async def process_document(
    file: UploadFile = File(...),
    export_format: str = Form(default="markdown"),
    ocr_enabled: bool = Form(default=False),
    extract_tables: bool = Form(default=True),
    extract_images: bool = Form(default=True),
    preserve_layout: bool = Form(default=True)
):
    """
    Process a document and return structured content.

    Args:
        file: Uploaded document file
        export_format: Output format (markdown, json, html)
        ocr_enabled: Enable OCR for scanned documents
        extract_tables: Extract table structures
        extract_images: Extract embedded images
        preserve_layout: Preserve document layout

    Returns:
        ProcessingResponse with extracted content and metadata
    """
    import time
    start_time = time.time()
    if ocr_enabled and os.getenv("DOCLING_ENABLE_OCR", "false").lower() != "true":
        raise HTTPException(status_code=422, detail="OCR is disabled on this worker. Enable DOCLING_ENABLE_OCR to use it.")
    if not preserve_layout:
        raise HTTPException(status_code=422, detail="This worker supports structured layout extraction only.")

    try:
        # Read file content
        maximum = int(os.getenv("DOCLING_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
        chunks = []
        size = 0
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > maximum:
                raise HTTPException(status_code=413, detail="Document exceeds processing size limit")
            chunks.append(chunk)
        file_content = b"".join(chunks)

        # Create temporary file for Docling processing
        # Docling works best with file paths
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp_file:
            tmp_file.write(file_content)
            tmp_file_path = tmp_file.name

        try:
            # Process document with Docling
            result = await run_in_threadpool(convert_local_document, tmp_file_path, ocr_enabled, extract_tables, extract_images)

            # Extract content based on format
            if export_format == "markdown":
                content = result.document.export_to_markdown()
            elif export_format == "json":
                content = result.document.export_to_json()
            elif export_format == "html":
                content = result.document.export_to_html()
            else:
                content = result.document.export_to_markdown()  # Default to markdown

            # Extract metadata
            metadata = {
                "ocr_enabled": ocr_enabled,
                "extract_tables": extract_tables,
                "extract_images": extract_images,
                "preserve_layout": preserve_layout,
                "filename": file.filename,
                "content_type": file.content_type,
                "size_bytes": len(file_content),
                "num_pages": len(result.document.pages) if hasattr(result.document, 'pages') else None,
                "format": export_format
            }

            # Extract sections from document structure
            sections = []
            if hasattr(result.document, 'texts') and result.document.texts:
                for idx, text_item in enumerate(result.document.texts):
                    sections.append({
                        "index": idx,
                        "text": text_item.text if hasattr(text_item, 'text') else str(text_item),
                        "type": text_item.label if hasattr(text_item, 'label') else "paragraph"
                    })

            # Extract tables
            tables = []
            if extract_tables and hasattr(result.document, 'tables') and result.document.tables:
                for idx, table in enumerate(result.document.tables):
                    tables.append({
                        "index": idx,
                        "data": table.export_to_dataframe().to_dict() if hasattr(table, 'export_to_dataframe') else {},
                        "num_rows": table.num_rows if hasattr(table, 'num_rows') else 0,
                        "num_cols": table.num_cols if hasattr(table, 'num_cols') else 0
                    })

            # Extract images
            images = []
            if extract_images and hasattr(result.document, 'pictures') and result.document.pictures:
                for idx, picture in enumerate(result.document.pictures):
                    images.append({
                        "index": idx,
                        "caption": picture.caption if hasattr(picture, 'caption') else None,
                        "format": picture.format if hasattr(picture, 'format') else None
                    })

            processing_time_ms = int((time.time() - start_time) * 1000)

            return ProcessingResponse(
                success=True,
                content=content,
                metadata=metadata,
                sections=sections if sections else None,
                tables=tables if tables else None,
                images=images if images else None,
                processing_time_ms=processing_time_ms
            )

        finally:
            # Clean up temporary file
            try:
                os.unlink(tmp_file_path)
            except:
                pass

    except HTTPException:
        raise
    except Exception as e:
        processing_time_ms = int((time.time() - start_time) * 1000)
        return ProcessingResponse(
            success=False,
            error=f"Processing failed: {str(e)}",
            processing_time_ms=processing_time_ms
        )


@app.post("/process-url")
async def process_document_url(url: str, export_format: str = "markdown"):
    raise HTTPException(status_code=410, detail="Remote URL processing is disabled. Upload a local file instead.")


@app.post("/extract-page-images")
async def extract_page_images(
    file: UploadFile = File(...),
    max_pages: int = Form(default=10),
    dpi: int = Form(default=150)
):
    """
    Extract pages from PDF as base64-encoded images.

    Args:
        file: PDF file to process
        max_pages: Maximum number of pages to extract (default: 10)
        dpi: Image resolution in DPI (default: 150, higher = better quality but larger)

    Returns:
        List of page images as base64 strings
    """
    import time
    start_time = time.time()

    try:
        # Read file content
        file_content = await file.read()

        # Open PDF with PyMuPDF
        pdf_document = fitz.open(stream=file_content, filetype="pdf")

        page_images = []
        num_pages = min(len(pdf_document), max_pages)

        for page_num in range(num_pages):
            try:
                page = pdf_document[page_num]

                # Convert page to image
                # zoom factor: dpi/72 (72 is default PDF DPI)
                zoom = dpi / 72
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat, alpha=False)

                # Convert to PNG bytes
                img_bytes = pix.tobytes("png")

                # Encode to base64
                img_base64 = base64.b64encode(img_bytes).decode('utf-8')

                page_images.append({
                    "page": page_num + 1,
                    "width": pix.width,
                    "height": pix.height,
                    "format": "png",
                    "base64": img_base64
                })

            except Exception as page_error:
                print(f"Failed to convert page {page_num + 1}: {str(page_error)}")
                continue

        pdf_document.close()

        processing_time_ms = int((time.time() - start_time) * 1000)

        return {
            "success": True,
            "num_pages": num_pages,
            "images": page_images,
            "processing_time_ms": processing_time_ms
        }

    except HTTPException:
        raise
    except Exception as e:
        processing_time_ms = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "error": f"Page extraction failed: {str(e)}",
            "processing_time_ms": processing_time_ms
        }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    host = os.getenv("HOST", "0.0.0.0")

    # Disable reload in production - Railway always sets these env vars
    # If any production indicator is present, disable reload
    is_production = bool(
        os.getenv("RAILWAY_ENVIRONMENT_NAME") or  # Railway primary indicator
        os.getenv("RAILWAY_ENVIRONMENT") or       # Railway alternate
        os.getenv("RAILWAY_STATIC_URL") or        # Railway
        os.getenv("FLY_APP_NAME") or              # Fly.io
        os.getenv("RENDER") or                     # Render.com
        os.getenv("VERCEL")                        # Vercel
    )

    # If PORT was set externally (not default 8001), assume production
    if port != 8001:
        is_production = True

    reload = not is_production  # False in production, True in local dev

    print(f"🚀 Starting Docling in {'PRODUCTION' if is_production else 'DEVELOPMENT'} mode")
    print(f"   Reload: {reload}")
    print(f"   Port: {port}")
    print(f"   Host: {host}")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )
