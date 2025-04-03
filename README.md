# Paperless Docling Service

A service that automatically processes documents in Paperless using docling and updates their content.

## Features

- Automatically detects documents with a custom tag in Paperless
- Downloads documents from Paperless
- Processes documents using docling with customizable settings
- Updates document content in Paperless via API
- Removes the tag after processing
- Provides status API endpoints
- Highly configurable through environment variables

## Prerequisites

- Docker and Docker Compose
- NVIDIA GPU with proper drivers and nvidia-docker2 installed (for GPU acceleration)
- Access to Paperless API
- A tag in your Paperless instance (default: "docling")

## Installation

1. Clone this repository
2. Copy `.env.example` to `.env` and customize the variables:
   ```bash
   cp .env.example .env
   ```
3. Edit the `.env` file with your Paperless API credentials
4. Start the service:
   ```bash
   docker-compose up -d
   ```
   
   Or for GPU-accelerated processing:
   ```bash
   docker-compose -f docker-compose.cuda.yml up -d
   ```

## Configuration

The service can be configured through environment variables:

### API Connection Settings

These are mandatory:

| Variable            | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `PAPERLESS_API_URL` | URL of your Paperless instance API                              |
| `PAPERLESS_AUTH`    | Basic authentication token (base64 encoded `username:password`) |

### Tag Processing Settings

| Variable         | Description                                         | Default          |
| ---------------- | --------------------------------------------------- | ---------------- |
| `TAG_NAME`       | Name of the tag to look for in Paperless            | docling          |
| `CHECK_INTERVAL` | Interval in milliseconds to check for new documents | 60000 (1 minute) |

### Docling Settings

| Variable              | Description                                 | Default     |
| --------------------- | ------------------------------------------- | ----------- |
| `DOCLING_PIPELINE`    | The pipeline to use with docling            | vlm         |
| `DOCLING_MODEL`       | The model to use with docling               | smoldocling |
| `DOCLING_DEVICE`      | The device to use (cuda, cpu)               | cuda        |
| `DOCLING_THREADS`     | Number of threads to use                    | 32          |
| `DOCLING_PDF_BACKEND` | PDF backend to use                          | dlparse_v4  |
| `DOCLING_OCR_ENGINE`  | OCR engine to use                           | easyocr     |
| `DOCLING_EXTRA_ARGS`  | Any additional arguments to pass to docling | (empty)     |

### Server Settings

| Variable | Description                              | Default |
| -------- | ---------------------------------------- | ------- |
| `PORT`   | The port on which the API server listens | 3000    |

## Usage

1. Configure the service with appropriate environment variables
2. Start the service using docker-compose
3. Tag documents in Paperless with your configured tag
4. The service will:
   - Check for new tagged documents at the configured interval
   - Process new documents automatically
   - Update the document content in Paperless
   - Remove the tag after processing

5. Monitor the service:
   - Check status: `curl http://localhost:3000/status`
   - View queue: `curl http://localhost:3000/queue`

## Workflow

1. The service finds documents with the configured tag
2. It adds the documents to a processing queue
3. Each document is processed by docling to extract content
4. The document's content is updated in Paperless
5. The tag is removed from the document
6. Temporary files are cleaned up

## API Endpoints

- `GET /status`: Get detailed status information including current configuration, processing status, and queue information
- `GET /queue`: List documents in the processing queue

## Logs

View service logs:
```bash
docker-compose logs -f
```

## Development

To make changes to the code:

1. Clone the repository
2. Make your changes
3. Build and run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

For development with automatic reloading:
```bash
npm run dev
```

## Project Structure

- `docling-server.js`: Main server implementation
- `Dockerfile`: Docker container definition
- `docker-compose.yml`: Standard Docker Compose configuration
- `docker-compose.cuda.yml`: GPU-enabled Docker Compose configuration
- `.env.example`: Example environment configuration
- `package.json`: Node.js dependencies

## Dependencies

- Express.js: Web server framework
- Axios: HTTP client for API requests
- UUID: For generating unique identifiers
- Docling: Document processing tool (installed in the Docker container)

## Security Note

The `.env` file contains sensitive credentials. Make sure to:
- Add `.env` to your `.gitignore`
- Use secure credentials
- Limit access to the server running this service
