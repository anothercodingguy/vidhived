# Vidhived.ai - Legal Co-pilot Backend
# This file contains the main Flask application that powers the backend services.

import os
import re
import uuid
import json
import logging
from typing import Tuple
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google.cloud import vision, storage, aiplatform
from concurrent.futures import ThreadPoolExecutor

# Load environment variables
load_dotenv()

# --- Configuration ---
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
GCP_REGION = os.getenv("GCP_REGION", "us-central1")
GCS_BUCKET_NAME = os.getenv("GCS_BUCKET_NAME", "")
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

# Initialize Flask App and Executor for background tasks
app = Flask(__name__)
CORS(app, resources={r"*": {"origins": os.getenv("CORS_ORIGINS", "*")}})
executor = ThreadPoolExecutor(max_workers=int(os.getenv("WORKER_THREADS", "4")))

# Configure logging
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("vidhived-backend")

# Validate critical configuration
if not GCP_PROJECT_ID or not GCS_BUCKET_NAME:
    logger.warning("GCP_PROJECT_ID or GCS_BUCKET_NAME not configured. Some features may not work.")
if GOOGLE_APPLICATION_CREDENTIALS and os.path.exists(GOOGLE_APPLICATION_CREDENTIALS):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_APPLICATION_CREDENTIALS


# --- Core Logic: Legal Phrase Importance Scorer ---
class LegalPhraseScorer:
    """
    Calculates an importance score for a legal phrase based on predefined patterns.
    """
    def __init__(self):
        self._compile_patterns()

    def _compile_patterns(self):
        # Patterns for legal obligations, payments, consequences, and time-sensitive terms
        self.obligation_patterns = [
            (re.compile(r'\b(shall|must|required to|obligated to|bound to)\b', re.IGNORECASE), 0.65),
            (re.compile(r'\b(has the right to|entitled to|may demand|can require)\b', re.IGNORECASE), 0.60),
            (re.compile(r'\b(responsible for|liable for|accountable for)\b', re.IGNORECASE), 0.66),
        ]
        self.payment_patterns = [
            (re.compile(r'\b(payment shall be made|pay|due on|due within)\b', re.IGNORECASE), 0.78),
            (re.compile(r'\b(interest|late payment penalty|overdue)\b', re.IGNORECASE), 0.75),
            (re.compile(r'\b(advance payment|security deposit|earnest money)\b', re.IGNORECASE), 0.72),
        ]
        self.consequence_patterns = [
            (re.compile(r'\b(in case of default|breach of contract|violation of)\b', re.IGNORECASE), 0.80),
            (re.compile(r'\b(liable to pay damages|legal action|court proceedings)\b', re.IGNORECASE), 0.78),
            (re.compile(r'\b(contract may be terminated|agreement is cancelled)\b', re.IGNORECASE), 0.76),
            (re.compile(r'\b(forfeiture of|penalty of|fine of)\b', re.IGNORECASE), 0.74),
        ]
        self.time_patterns = [
            (re.compile(r'\b(within \d+\s+days?|not later than|before the expiry)\b', re.IGNORECASE), 0.58),
            (re.compile(r'\b(notice period of|during the term of|upon expiry of)\b', re.IGNORECASE), 0.55),
            (re.compile(r'\b(immediate(?:ly)?|forthwith|without delay)\b', re.IGNORECASE), 0.60),
        ]
        self.formality_patterns = [
            (re.compile(r'\b(this agreement is made|whereas the parties|in witness whereof)\b', re.IGNORECASE), 0.15),
            (re.compile(r'\b(governed by|jurisdiction|arbitration)\b', re.IGNORECASE), 0.18),
        ]
        self.negation_pattern = re.compile(r'\b(not|never|without|except|unless|no)\s+', re.IGNORECASE)
        self.emphasis_pattern = re.compile(r'\b[A-Z]{2,}\b|\"[^\"]*\"')

    def score_phrase(self, phrase: str) -> float:
        if not phrase.strip():
            return 0.0

        matched_scores = []
        pattern_groups = [
            (self.obligation_patterns, "obligation"),
            (self.payment_patterns, "payment"),
            (self.consequence_patterns, "consequence"),
            (self.time_patterns, "time"),
        ]

        # Check high-importance patterns first
        for patterns, category in pattern_groups:
            for pattern, score in patterns:
                if pattern.search(phrase):
                    matched_scores.append((score, category))

        # Check low-importance formality patterns
        is_formality = False
        for pattern, score in self.formality_patterns:
            if pattern.search(phrase):
                matched_scores.append((score, "formality"))
                is_formality = True

        if not matched_scores:
            return 0.0
        
        # Use formality score if present, otherwise use the max score
        if is_formality:
            base_score = max([s for s, c in matched_scores if c == "formality"])
        else:
            base_score = max([s for s, c in matched_scores]) if matched_scores else 0.0
        
        # Apply context modifiers
        context_bonus = 0.0
        if self.negation_pattern.search(phrase):
            context_bonus -= 0.15
        if self.emphasis_pattern.search(phrase):
            context_bonus += 0.08
            
        unique_categories = {cat for _, cat in matched_scores if cat != "formality"}
        if len(unique_categories) > 1:
            context_bonus += 0.1 * (len(unique_categories) - 1)
        if "consequence" in unique_categories and "payment" in unique_categories:
            context_bonus += 0.05
        if "obligation" in unique_categories and "time" in unique_categories:
            context_bonus += 0.03
            
        final_score = min(1.0, max(0.0, base_score + context_bonus))
        return round(final_score, 3)

# Instantiate the scorer globally
phrase_scorer = LegalPhraseScorer()

# In-memory "database" to track job status.
# In a production environment, use a proper database like Firestore or Redis.
document_analysis_jobs = {}


def get_risk_category(score: float) -> str:
    """
    Categorizes a score into Red, Yellow, or Green based on risk level.
    """
    if score >= 0.70:
        return "Red"  # Risky
    elif 0.40 <= score < 0.70:
        return "Yellow"  # Caution
    else:
        return "Green"  # Standard


def analyze_document_task(document_id: str, gcs_uri: str):
    """
    The main background task for processing a document.
    This function will be executed in a separate thread.
    """
    try:
        # --- 1. OCR with Google Cloud Vision ---
        vision_client = vision.ImageAnnotatorClient()
        feature = vision.Feature(type_=vision.Feature.Type.DOCUMENT_TEXT_DETECTION)
        gcs_source = vision.GcsSource(uri=gcs_uri)
        input_config = vision.InputConfig(gcs_source=gcs_source, mime_type='application/pdf')
        
        async_request = vision.AsyncAnnotateFileRequest(
            features=[feature], input_config=input_config, output_config=output_config
        )
        
        # In production, you'd need a GCS bucket for the output
        gcs_destination = vision.GcsDestination(uri=f"gs://{GCS_BUCKET_NAME}/analysis-results/{document_id}/")
        output_config = vision.OutputConfig(gcs_destination=gcs_destination, batch_size=20)
        
        operation = vision_client.async_batch_annotate_files(requests=[async_request])
        logger.info(f"Waiting for OCR operation to complete for document: {document_id}")
        operation.result(timeout=420) # This waits for the OCR to finish.

        # --- 2. Process OCR Output ---
        storage_client = storage.Client()
        bucket = storage_client.get_bucket(GCS_BUCKET_NAME)
        
        full_text = ""
        clauses = []
        try:
            # --- 1. OCR with Google Cloud Vision ---
            vision_client = vision.ImageAnnotatorClient()
            feature = vision.Feature(type_=vision.Feature.Type.DOCUMENT_TEXT_DETECTION)
            gcs_source = vision.GcsSource(uri=gcs_uri)
            input_config = vision.InputConfig(gcs_source=gcs_source, mime_type='application/pdf')
            # Define gcs_destination and output_config before using them
            gcs_destination = vision.GcsDestination(uri=f"gs://{GCS_BUCKET_NAME}/analysis-results/{document_id}/")
            output_config = vision.OutputConfig(gcs_destination=gcs_destination, batch_size=20)
            async_request = vision.AsyncAnnotateFileRequest(
                features=[feature], input_config=input_config, output_config=output_config
            )
            operation = vision_client.async_batch_annotate_files(requests=[async_request])
            logger.info(f"Waiting for OCR operation to complete for document: {document_id}")
            operation.result(timeout=420) # This waits for the OCR to finish.

            # --- 2. Process OCR Output ---
            storage_client = storage.Client()
            bucket = storage_client.get_bucket(GCS_BUCKET_NAME)
            full_text = ""
            clauses = []
            # Find the OCR output JSON files in GCS
            prefix = f"analysis-results/{document_id}/"
            blob_list = [blob for blob in bucket.list_blobs(prefix=prefix) if blob.name.endswith('.json')]
            for blob in blob_list:
                json_string = blob.download_as_string()
                response = json.loads(json_string)
                for page in response['responses'][0]['fullTextAnnotation']['pages']:
                    for block in page['blocks']:
                        block_text = ""
                        vertices = block['boundingBox']['vertices']
                        for paragraph in block['paragraphs']:
                            for word in paragraph['words']:
                                word_text = "".join([symbol['text'] for symbol in word['symbols']])
                                block_text += word_text + " "
                                # This is a simplification; proper sentence reconstruction is complex.
                        full_text += block_text + "\n\n"
                        clauses.append({
                            "text": block_text.strip(),
                            "location": vertices, # Bounding box for the entire block
                        })

            # --- 3. Score, Categorize, and Simplify each Clause ---
            aiplatform.init(project=GCP_PROJECT_ID, location=GCP_REGION)
            model = aiplatform.gapic.ModelServiceClient().model_path(
                project=GCP_PROJECT_ID, location=GCP_REGION, model="gemini-1.5-pro-preview-0409"
            )
            analyzed_clauses = []
            for clause in clauses:
                clause_text = clause['text']
                if len(clause_text.split()) < 5: # Skip very short text blocks
                    continue
                score = phrase_scorer.score_phrase(clause_text)
                category = get_risk_category(score)
                simplified_explanation = ""
                clause_type = "General"
                if category in ["Red", "Yellow"]:
                    # MOCK: Replace with Vertex AI call in production
                    if "terminate" in clause_text.lower():
                        clause_type = "Termination Clause"
                        simplified_explanation = "This section explains how and when the agreement can be ended by either party. Pay close attention to the reasons and notice periods required."
                    elif "pay" in clause_text.lower() or "payment" in clause_text.lower():
                        clause_type = "Payment Terms"
                        simplified_explanation = "This describes when and how much money needs to be paid. Check for deadlines and any penalties for late payments."
                    else:
                        clause_type = "General Obligation"
                        simplified_explanation = "This clause outlines a specific duty or responsibility that one of the parties must follow."
                if category in ["Red", "Yellow", "Green"]:
                    analyzed_clauses.append({
                        "text": clause_text,
                        "location": clause['location'],
                        "score": score,
                        "category": category,
                        "explanation": simplified_explanation,
                        "type": clause_type
                    })

            # --- 4. Store Final Analysis ---
            final_result = {
                "documentId": document_id,
                "status": "completed",
                "fullText": full_text,
                "analysis": analyzed_clauses
            }
            # Save the final JSON to GCS
            result_blob = bucket.blob(f"analysis-results/{document_id}/final_analysis.json")
            result_blob.upload_from_string(json.dumps(final_result, indent=2), content_type='application/json')
            # Update in-memory job status
            document_analysis_jobs[document_id] = final_result
            logger.info(f"Analysis completed successfully for document: {document_id}")

        except Exception as e:
            logger.exception(f"Error analyzing document {document_id}: {e}")
            document_analysis_jobs[document_id] = {
                "documentId": document_id,
                "status": "failed",
                "error": str(e)
            }
@app.errorhandler(404)
def handle_not_found(error) -> Tuple[dict, int]:
    return jsonify({"error": "Not Found"}), 404

@app.errorhandler(500)
def handle_server_error(error) -> Tuple[dict, int]:
    logger.exception("Internal server error")
    return jsonify({"error": "Internal Server Error"}), 500

@app.route('/', methods=['GET'])
def root():
    return jsonify({"message": "Vidhived.ai Backend API", "version": "1.0", "endpoints": ["/health", "/upload", "/document/<id>", "/ask"]})

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


# --- API Endpoints ---
@app.route('/upload', methods=['POST'])
def upload_document():
    """
    Endpoint to upload a PDF document for analysis.
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if file and file.filename.lower().endswith('.pdf'):
        try:
            document_id = str(uuid.uuid4())
            filename = f"uploads/{document_id}.pdf"
            
            # Upload to Google Cloud Storage
            storage_client = storage.Client(project=GCP_PROJECT_ID) if GCP_PROJECT_ID else storage.Client()
            bucket = storage_client.bucket(GCS_BUCKET_NAME)
            blob = bucket.blob(filename)
            
            blob.upload_from_file(file)
            gcs_uri = f"gs://{GCS_BUCKET_NAME}/{filename}"
            
            # Set initial status and start background task
            document_analysis_jobs[document_id] = {
                "documentId": document_id,
                "status": "processing",
                "gcs_uri": gcs_uri
            }
            executor.submit(analyze_document_task, document_id, gcs_uri)
            
            return jsonify({
                "message": "File uploaded successfully. Analysis started.",
                "documentId": document_id
            }), 202
        
        except Exception as e:
            logger.exception("Upload failed")
            return jsonify({"error": f"An error occurred: {str(e)}"}), 500

    return jsonify({"error": "Invalid file type. Please upload a PDF."}), 400


@app.route('/document/<string:document_id>', methods=['GET'])
def get_document_analysis(document_id: str):
    """
    Endpoint to retrieve the status and results of a document analysis.
    """
    job = document_analysis_jobs.get(document_id)
    if not job:
        # If not in memory, try to fetch from GCS (for persistence)
        try:
            storage_client = storage.Client()
            bucket = storage_client.bucket(GCS_BUCKET_NAME)
            blob = bucket.blob(f"analysis-results/{document_id}/final_analysis.json")
            if blob.exists():
                job_data = blob.download_as_string()
                job = json.loads(job_data)
                document_analysis_jobs[document_id] = job # Cache it
            else:
                return jsonify({"error": "Document not found"}), 404
        except Exception as e:
            logger.exception("Retrieval from GCS failed")
            return jsonify({"error": f"Could not retrieve document: {str(e)}"}), 500

    return jsonify(job)

@app.route('/ask', methods=['POST'])
def ask_question():
    """
    Endpoint for the Q&A feature.
    """
    data = request.get_json(silent=True) or {}
    if not data or "documentId" not in data or "query" not in data:
        return jsonify({"error": "Missing documentId or query in request body"}), 400
        
    document_id = data['documentId']
    query = data['query']
    
    analysis_job = document_analysis_jobs.get(document_id)
    if not analysis_job or analysis_job.get('status') != 'completed':
        return jsonify({"error": "Document analysis is not complete or does not exist."}), 404
        
    full_text = analysis_job.get('fullText', '')

    # --- Call Gemini 1.5 Pro for contextual explanation ---
    try:
        aiplatform.init(project=GCP_PROJECT_ID, location=GCP_REGION)
        # MOCK RESPONSE for demonstration
        answer = f"In the context of the document, the phrase '{query}' means that [mock explanation based on the query]. This is a standard way of stating this type of obligation and you should pay attention to any associated deadlines or conditions mentioned nearby."

        return jsonify({"answer": answer})
        
    except Exception as e:
        logger.exception("AI model invocation failed")
        return jsonify({"error": f"Failed to get explanation from AI model: {str(e)}"}), 500


if __name__ == '__main__':
    # Use 0.0.0.0 to make it accessible on your local network
    logger.info(f"Starting Flask app on port {os.getenv('PORT', '8080')}")
    app.run(host='0.0.0.0', port=int(os.getenv("PORT", "8080")), debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
