from flask import Flask, request, jsonify
from flask_cors import CORS
from pydantic import BaseModel
from pydantic import BaseModel
from pinecone import Pinecone
from openai import OpenAI
import os
from dotenv import load_dotenv
from PyPDF2 import PdfReader
from langchain_community.document_loaders import UnstructuredPDFLoader, OnlinePDFLoader, DirectoryLoader, TextLoader, PyPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_pinecone import PineconeVectorStore
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.embeddings import HuggingFaceEmbeddings
# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS

# Initialize Pinecone and OpenAI
load_dotenv(dotenv_path='.env.local')
pinecone_api_key = os.getenv('PINECONE_API_KEY')
openai_api_key = os.getenv('OPENAI_API_KEY')
pinecone_env = os.getenv('PINECONE_ENVIRONMENT')
pinecone_index_name = os.getenv('PINECONE_INDEX_NAME')

pc = Pinecone(api_key=pinecone_api_key,environment=pinecone_env)

index = pc.Index(pinecone_index_name)

OpenAI.api_key = openai_api_key

embeddings = OpenAIEmbeddings()
embed_model = "text-embedding-3-small"
openai_client = OpenAI()

def extract_text_from_pdf(pdf_file):
    text = ""
    try:
        # Print file info for debugging
        
        # Use PdfReader to extract text
        pdf = PdfReader(pdf_file)
        for page_num, page in enumerate(pdf.pages):
            page_text = page.extract_text()
            #print(f"Page {page_num} text:", page_text)  # Debug print for each page
            text += page_text or ""
    except Exception as e:
        print("Error extracting text:", str(e))  # Print any errors that occur
    return text

@app.route('/process-resume', methods=['POST'])
def process_resume():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # Extract text from PDF
        text = extract_text_from_pdf(file)
        #print(text)
        # Perform RAG with Pinecone and OpenAI
        try:
            response = openai_client.embeddings.create(
                input=[text],
                model="text-embedding-3-small"
            )
            query_embedding = response.data[0].embedding
            #print("Query embedding:", query_embedding)  # Debug print
        except Exception as e:
            print("Error generating embedding:", str(e))
        
        # Example metadata, you can customize this based on your application
        metadata = {"role": "resume", "experience_level": "mid"}

        # Upsert the embedding with metadata into Pinecone
        try:
            index.upsert(vectors=[
                {
                    "values": query_embedding,
                    "metadata": metadata
                }
            ], namespace="career-coach-resumes")
            print("Embedding upserted successfully.")
        except Exception as e:
            print("Error upserting embedding:", str(e))
            

    
        # Query Pinecone with the generated embedding
        try:
            results = index.query(
                vector=query_embedding,  # Use the embedding you generated earlier
                top_k=5,  # Adjust the top_k as needed
                include_metadata=True,
                namespace="career-coach-resumes"  # Optional filter based on metadata
            )
            print("Pinecone query results:", results)  # Debug print
        except Exception as e:
            print("Error querying Pinecone:", str(e))

        context = ""
        try:
            # Extract metadata or other useful information from the results
            for match in results['matches']:
                context += f"ID: {match['id']}, Score: {match['score']}, Metadata: {match['metadata']}\n"

            # Debug print to check the extracted context
            print("Extracted context for GPT:", context)
        except Exception as e:
            print("Error processing Pinecone results:", str(e))
            
        try:
            primer = f"""You are a career coach assistant. Answer any questions I have about my resume I provided."""
            prompt = f"{primer}\n\nResume Context:\n{context}\n\nResume Text:\n{text}"

            res = openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": primer},
                    {"role": "user", "content": prompt}
                ]
            )

            feedback = res.choices[0].message.content
            formatted_feedback = f"**Feedback:**\n\n{feedback}"
            
            print("Feedback:", formatted_feedback) 
            print("Feedback:", feedback)  # Debug print
        except Exception as e:
            print("Error generating feedback:", str(e))


        return jsonify({"feedback": feedback})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug = True)