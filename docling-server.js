const express = require("express");
const { exec, execSync } = require("child_process");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());

// Environment variables with defaults
const PORT = process.env.PORT || 3000;
const PAPERLESS_API_URL = process.env.PAPERLESS_API_URL;
const PAPERLESS_AUTH = process.env.PAPERLESS_AUTH;
const TAG_NAME = process.env.TAG_NAME || "docling";
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || "60000", 10);
const DOCLING_PIPELINE = process.env.DOCLING_PIPELINE || "vlm";
const DOCLING_MODEL = process.env.DOCLING_MODEL || "smoldocling";
const DOCLING_DEVICE = process.env.DOCLING_DEVICE || "cuda";
const DOCLING_THREADS = parseInt(process.env.DOCLING_THREADS || "32", 10);
const DOCLING_PDF_BACKEND = process.env.DOCLING_PDF_BACKEND || "dlparse_v4";
const DOCLING_EXTRA_ARGS = process.env.DOCLING_EXTRA_ARGS || "";
const DOCLING_OCR_ENGINE = process.env.DOCLING_OCR_ENGINE || "easyocr";
// Configuration
const PROCESSING_DIR = path.join(__dirname, "processing");

// Queue for processing documents
let processingQueue = [];
let isProcessing = false;
let targetTagId = null;

// Ensure required directories exist
async function ensureDirectories() {
	await fs.mkdir(PROCESSING_DIR, { recursive: true });
}

// Escape file path for shell command
function escapePath(filePath) {
	return `"${filePath.replace(/"/g, '\\"')}"`;
}

async function findTargetTag() {
	try {
		// Get the tag ID for the target tag
		const tagsResponse = await axios.get(`${PAPERLESS_API_URL}/tags/`, {
			headers: {
				Authorization: PAPERLESS_AUTH,
				Accept: "application/json; version=2",
			},
		});

		const tag = tagsResponse.data.results.find(
			(tag) => tag.name === TAG_NAME
		);
		if (!tag) {
			console.log(`Tag "${TAG_NAME}" not found`);
			return null;
		}

		targetTagId = tag.id;
		console.log(`Found tag "${TAG_NAME}" with ID: ${targetTagId}`);
		return targetTagId;
	} catch (error) {
		console.error(`Error finding tag "${TAG_NAME}":`, error);
		return null;
	}
}

async function getDocumentsWithTag() {
	try {
		if (!targetTagId) {
			const tagId = await findTargetTag();
			if (!tagId) return [];
		}

		// Get documents with this tag
		const documentsResponse = await axios.get(
			`${PAPERLESS_API_URL}/documents/?tags__id__all=${targetTagId}`,
			{
				headers: {
					Authorization: PAPERLESS_AUTH,
					Accept: "application/json; version=2",
				},
			}
		);

		return documentsResponse.data.results;
	} catch (error) {
		console.error("Error fetching documents:", error);
		return [];
	}
}

async function removeTagFromDocument(documentId) {
	try {
		// First get the current document to see its tags
		const response = await axios.get(
			`${PAPERLESS_API_URL}/documents/${documentId}/`,
			{
				headers: {
					Authorization: PAPERLESS_AUTH,
					Accept: "application/json; version=2",
				},
			}
		);

		// Filter out the target tag
		const currentTags = response.data.tags || [];
		const updatedTags = currentTags.filter(
			(tagId) => tagId !== targetTagId
		);

		// Update the document with the new tags
		await axios.patch(
			`${PAPERLESS_API_URL}/documents/${documentId}/`,
			{
				tags: updatedTags,
			},
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: PAPERLESS_AUTH,
					Accept: "application/json; version=2",
				},
			}
		);

		console.log(`Removed tag "${TAG_NAME}" from document ${documentId}`);
	} catch (error) {
		console.error(`Error removing tag from document ${documentId}:`, error);
		throw error;
	}
}

async function processDocument(document) {
	const documentId = document.id;
	const outputDir = path.join("/tmp", "md", uuidv4());

	try {
		const doclingCommand = `
		docling \
		--pipeline ${DOCLING_PIPELINE} \
		--vlm-model ${DOCLING_MODEL} \
		--device ${DOCLING_DEVICE} \
		--num-threads ${DOCLING_THREADS} \
		--output ${escapePath(outputDir)} \
		--ocr-engine ${DOCLING_OCR_ENGINE} \
		--pdf-backend ${DOCLING_PDF_BACKEND} \
		--headers '{"Authorization": "${PAPERLESS_AUTH}"}' \
		${DOCLING_EXTRA_ARGS} \
		${PAPERLESS_API_URL}/documents/${documentId}/download/
		 `;

		console.log(`Running docling command: ${doclingCommand}`);

		const start = Date.now();

		await new Promise((resolve, reject) => {
			exec(doclingCommand, (error, stdout, stderr) => {
				if (error) {
					console.error(`Docling stderr: ${stderr}`);
					reject(error);
					return;
				}
				console.log(`Docling stdout: ${stdout}`);
				resolve(stdout);
			});
		});

		const end = Date.now();
		console.log(`Docling took ${end - start}ms`);

		// Read the generated markdown file
		const files = await fs.readdir(outputDir);
		const mdFile = files.find((file) => file.endsWith(".md"));
		if (!mdFile) {
			throw new Error("No markdown file generated");
		}
		const content = await fs.readFile(
			path.join(outputDir, mdFile),
			"utf-8"
		);

		// Update document content in Paperless
		await axios.patch(
			`${PAPERLESS_API_URL}/documents/${documentId}/`,
			{
				content: content,
				mime_type: "application/pdf",
			},
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: PAPERLESS_AUTH,
					Accept: "application/json; version=2",
				},
			}
		);

		// Remove the target tag from the document
		await removeTagFromDocument(documentId);

		await fs
			.rm(outputDir, { recursive: true, force: true })
			.catch((err) =>
				console.error(`Error removing output directory: ${err}`)
			);

		console.log(`Successfully processed document: ${documentId}`);
		return true;
	} catch (error) {
		console.error(`Error processing document ${documentId}:`, error);

		// Clean up
		if (processingPath) {
			await fs
				.unlink(processingPath)
				.catch((err) =>
					console.error(`Error removing temporary file: ${err}`)
				);
		}
		await fs
			.rm(outputDir, { recursive: true, force: true })
			.catch((err) =>
				console.error(`Error removing output directory: ${err}`)
			);

		return false;
	}
}

async function processNextDocument() {
	if (isProcessing || processingQueue.length === 0) {
		return;
	}

	isProcessing = true;
	const document = processingQueue.shift();
	try {
		await processDocument(document);
	} catch (error) {
		console.error(
			`Error in processNextDocument for document ${document.id}:`,
			error
		);
	} finally {
		isProcessing = false;
		// Process next document if available
		processNextDocument();
	}
}

async function checkForNewDocuments() {
	try {
		const documents = await getDocumentsWithTag();

		// Add new documents to queue
		for (const doc of documents) {
			// Check if document is already in queue
			if (!processingQueue.some((queuedDoc) => queuedDoc.id === doc.id)) {
				processingQueue.push(doc);
				console.log(`Added document ${doc.id} to queue`);
			}
		}

		// Start processing if not already processing
		if (!isProcessing && processingQueue.length > 0) {
			console.log("Starting processing");
			processNextDocument();
		}
	} catch (error) {
		console.error("Error checking for new documents:", error);
	}
}

// Initialize the service
async function initializeService() {
	await ensureDirectories();

	// Find the target tag
	await findTargetTag();

	// Check for new documents at the configured interval
	setInterval(async () => {
		await checkForNewDocuments();

		// Ensure queue processing continues even if there was an error
		if (!isProcessing && processingQueue.length > 0) {
			console.log("Restarting processing after interval check");
			processNextDocument();
		}
	}, CHECK_INTERVAL);

	// Initial check
	checkForNewDocuments();
}

// API endpoints
app.get("/status", (req, res) => {
	res.json({
		queueLength: processingQueue.length,
		isProcessing,
		configuration: {
			tagName: TAG_NAME,
			tagId: targetTagId,
			checkInterval: CHECK_INTERVAL,
			doclingPipeline: DOCLING_PIPELINE,
			doclingModel: DOCLING_MODEL,
			doclingDevice: DOCLING_DEVICE,
			doclingThreads: DOCLING_THREADS,
			doclingPdfBackend: DOCLING_PDF_BACKEND,
			doclingExtraArgs: DOCLING_EXTRA_ARGS,
		},
		processingQueue: processingQueue.map((doc) => ({
			id: doc.id,
			title: doc.title,
		})),
	});
});

app.get("/queue", (req, res) => {
	res.json({
		queue: processingQueue.map((doc) => ({
			id: doc.id,
			title: doc.title,
		})),
	});
});

// Start the service
initializeService().catch(console.error);

app.listen(PORT, () => {
	console.log(`Service running on port ${PORT}`);
	console.log(`Configured to process documents with tag: "${TAG_NAME}"`);
	console.log(
		`Checking for new documents every ${CHECK_INTERVAL / 1000} seconds`
	);
});
