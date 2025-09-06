Vidhived ai - Your Smart Legal Co-pilot
Vidhived ai is an intelligent legal co-pilot designed to demystify complex legal documents. By leveraging the power of Google Cloud and advanced AI models like Gemini 1.5 Pro, it transforms dense contracts and agreements into simple, actionable insights, empowering users to understand their legal obligations with clarity and confidence.

✨ Key Features
Interactive Document Viewer: Upload and view your PDF documents in a clean, dual-pane interface.

AI-Powered Clause Analysis: Automatically extracts key clauses (e.g., notice periods, payment terms, termination conditions) and explains them in plain English.

Risk Assessment System: Uses a traffic-light system (🔴 Red, 🟡 Yellow, 🟢 Green) to categorize clauses by their importance and potential risk.

Interactive Highlighting: Click on an AI insight, and Vidhived.ai instantly highlights and scrolls to the exact clause within the PDF document.

Contextual Q&A: Don't understand a sentence? Paste it into the chat, and our AI will provide a simple explanation in the context of your document.

🏗️ System Architecture
Vidhived.ai is built on a robust, scalable cloud architecture that ensures efficient and secure document processing.

Upload: The user uploads a PDF via the React frontend.

Storage: The file is securely sent to a private Google Cloud Storage (GCS) bucket.

Digitization: The backend triggers Google Cloud Vision API to perform OCR on the PDF, extracting its text and layout data.

AI Analysis: The extracted text is sent to Google's Vertex AI, where Gemini 1.5 Pro identifies key clauses, simplifies them, and a custom scoring model assigns a risk level.

Response: The structured analysis (JSON) is sent back to the frontend.

Interaction: The frontend renders the PDF alongside the color-coded, interactive insights.

💻 Technology Stack
Frontend:

Framework: React (with Hooks)

Styling: Tailwind CSS

PDF Rendering: react-pdf

Icons: lucide-react

Backend:

Framework: Python 3.x with Flask

Cloud Services:

Google Cloud Storage: For secure file uploads and storage.

Google Cloud Vision API: For high-accuracy text extraction (OCR).

Google Vertex AI (Gemini 1.5 Pro): For clause analysis and Q&A.

API Communication: RESTful API with JSON

🚀 Getting Started
Follow these instructions to set up and run the Vidhived.ai project on your local machine for development and testing.

Prerequisites
Node.js and npm (for Frontend)

Python 3.8+ and pip (for Backend)

A Google Cloud Platform (GCP) project with billing enabled.

The gcloud CLI tool (optional but recommended).

1. Backend Setup
a. Clone the repository:

git clone [https://github.com/your-username/vidhived-ai.git](https://github.com/your-username/vidhived-ai.git)
cd vidhived-ai/backend

b. Set up Google Cloud:

Enable the Cloud Vision API, Cloud Storage API, and Vertex AI API in your GCP project.

Create a Service Account with the following roles: Vision AI Editor, Storage Admin, and Vertex AI User.

Download the JSON key file for this service account.

Create a Google Cloud Storage bucket.

c. Configure Environment Variables:

Rename .env.example to .env.

Fill in the required values: your GCP Project ID, GCS Bucket Name, and the path to your service account key JSON file.

d. Install Dependencies and Run:

# Install Python packages
pip install -r requirements.txt

# Run the Flask server
python main.py

The backend will be running at http://127.0.0.1:8080.

2. Frontend Setup
a. Navigate to the frontend directory:

cd ../frontend 

b. Configure Environment Variables:

Create a file named .env.local.

Add the backend API URL:

REACT_APP_API_URL=[http://127.0.0.1:8080](http://127.0.0.1:8080)

c. Install Dependencies and Run:

# Install Node modules
npm install

# Run the React development server
npm start

The frontend will open in your browser at http://localhost:3000.

📝 Usage
Open http://localhost:3000 in your browser.

Drag and drop a PDF file or click "Upload Document" to select a file.

Wait for the application to process the document.

View the rendered PDF on the left and the AI-generated insights on the right.

Click on any insight card to highlight the corresponding clause in the PDF.

Use the "Ask a Question" tab to get explanations for specific sentences.

🤝 Contributing
Contributions are welcome! If you have suggestions for improvements or want to fix a bug, please feel free to:

Fork the repository.

Create a new branch (git checkout -b feature/YourAmazingFeature).

Commit your changes (git commit -m 'Add some AmazingFeature').

Push to the branch (git push origin feature/YourAmazingFeature).

Open a Pull Request.
