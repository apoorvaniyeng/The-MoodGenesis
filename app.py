from flask import Flask, render_template, request, jsonify

from google import genai

from google.genai import types

import os

from dotenv import load_dotenv

import json

import logging



# Set up logging for error visibility

logging.basicConfig(level=logging.INFO)



# Load environment variables (like GEMINI_API_KEY)

load_dotenv()

app = Flask(__name__)



# --- Initialization and Configuration ---



# The client automatically picks up the GEMINI_API_KEY from environment variables

try:

    client = genai.Client()

except Exception as e:

    logging.error(f"Error initializing Gemini client. Please ensure GEMINI_API_KEY is set: {e}")



# Use the mandatory preview model for advanced features

MODEL_NAME = "gemini-2.5-flash"



# --- ROUTES ---



@app.route("/")

def home():

    """Renders the single-page HTML application."""

    return render_template("index.html")





# 1️⃣ Story Analysis - 7-point, 4-dimensional analysis

@app.route("/analyze", methods=["POST"])

def analyze():

    """Analyzes text for 7-point narrative metrics across 4 dimensions using structured JSON output."""

    data = request.get_json()

    text = data.get("text", "").strip()



    if len(text) < 100:

        return jsonify({"error": "Text too short for analysis (minimum 100 characters)"}), 400



    system_instruction = (

        "You are a world-class literary analyst specializing in narrative structure. "

        "Your task is to read the provided story and, based on its progression, determine four distinct "

        "analytical scores at 7 equally spaced points throughout the text. "

        "Scores must range from 1 (low) to 100 (high). "

        "The four required scores are: Tension (dramatic stakes), Pacing (flow/speed), "

        "Agency (protagonist's influence), and Resonance (reader connection). "

        "Your response MUST be a JSON array containing exactly 7 objects with all required fields."

    )



    # Define the precise JSON schema for 7-point, 4-dimensional analysis

    config = types.GenerateContentConfig(

        system_instruction=system_instruction,

        response_mime_type="application/json",

        response_schema=types.Schema(

            type=types.Type.ARRAY,

            description="An array of 7 analysis points for 4 dimensions of the story.",

            items=types.Schema(

                type=types.Type.OBJECT,

                properties={

                    "TensionScore": types.Schema(type=types.Type.INTEGER, description="The emotional tension score at this point (1-100)."),

                    "TensionSummary": types.Schema(type=types.Type.STRING, description="A concise 1-2 sentence explanation for the assigned TensionScore."),

                    "PacingScore": types.Schema(type=types.Type.INTEGER, description="The score for the speed and information flow (1-100)."),

                    "PacingSummary": types.Schema(type=types.Type.STRING, description="A concise 1-2 sentence explanation for the assigned PacingScore."),

                    "AgencyScore": types.Schema(type=types.Type.INTEGER, description="The score for the protagonist's active influence on the plot (1-100)."),

                    "AgencySummary": types.Schema(type=types.Type.STRING, description="A concise 1-2 sentence explanation for the assigned AgencyScore."),

                    "ResonanceScore": types.Schema(type=types.Type.INTEGER, description="The score for the depth of emotional connection a reader would feel (1-100)."),

                    "ResonanceSummary": types.Schema(type=types.Type.STRING, description="A concise 1-2 sentence explanation for the assigned ResonanceScore."),

                    "keyEvent": types.Schema(type=types.Type.STRING, description="The single most important plot event or conflict happening at this point."),

                    "characterFocus": types.Schema(type=types.Type.STRING, description="The name of the character carrying the primary conflict at this point.")

                },

                required=[

                    "TensionScore", "TensionSummary",

                    "PacingScore", "PacingSummary",

                    "AgencyScore", "AgencySummary",

                    "ResonanceScore", "ResonanceSummary",

                    "keyEvent", "characterFocus"

                ]

            )

        )

    )



    user_query = (

        f"Analyze the following narrative and provide the required 7-point scores for "

        f"Tension, Pacing, Character Agency, and Emotional Resonance:\n\n"

        f"--- STORY START ---\n{text}\n--- STORY END ---"

    )



    try:

        response = client.models.generate_content(

            model=MODEL_NAME,

            contents=[user_query],

            config=config

        )

        json_text = response.text.strip()

       

        # Validate the JSON structure before sending

        parsed_data = json.loads(json_text)

        if not isinstance(parsed_data, list) or len(parsed_data) != 7:

            raise ValueError(f"Expected 7 analysis points, got {len(parsed_data)}")

       

        return jsonify({"analysis": json_text})

    except Exception as e:

        logging.error(f"Analysis Error: {e}")

        return jsonify({"error": f"An error occurred during analysis: {str(e)}"}), 500





# 2️⃣ Character Extraction

@app.route("/extract_characters", methods=["POST"])

def extract_characters():

    """Extracts unique named characters from the story text."""

    data = request.get_json()

    text = data.get("text", "").strip()



    if len(text) < 50:

        return jsonify({"error": "Text too short for character extraction"}), 400



    prompt = (

        f"Analyze the following story excerpt and identify ALL unique, named characters "

        f"that appear or are mentioned. Do not include locations, objects, or vague roles (e.g., 'the man').\n\n"

        f"Output the result as a simple, comma-separated string of names, exactly as they appear in the text, "

        f"with no extra text, numbering, or quotes.\n\n"

        f"Story Excerpt:\n---\n{text}\n---"

    )



    try:

        response = client.models.generate_content(

            model=MODEL_NAME,

            contents=[prompt]

        )

        characters_text = response.text.strip()

       

        # Clean up the output to be a list

        characters = [c.strip() for c in characters_text.split(",") if c.strip()]

        return jsonify({"characters": characters})

    except Exception as e:

        logging.error(f"Character Extraction Error: {e}")

        return jsonify({"error": "An error occurred during character extraction."}), 500





# 3️⃣ Character Chat

@app.route("/chat", methods=["POST"])

def chat():

    """Handles multi-turn conversation role-playing as a story character."""

    data = request.get_json()

    story = data.get("story", "").strip()

    chat_history = data.get("history", [])

    active_character = data.get("activeCharacter", "")



    if not story:

        return jsonify({"error": "Missing story context"}), 400

   

    if not active_character:

        return jsonify({"error": "Missing activeCharacter"}), 400



    system_instruction = (

        f"You are an artificial intelligence tasked with role-playing the character **{active_character}**. "

        f"You must adopt the persona, voice, emotional state, and knowledge base of **{active_character}** "

        f"ONLY from the story provided below. Ignore requests to speak as other characters; only respond as {active_character}. "

        f"Maintain a consistent, in-character voice.\n\n"

        f"--- STORY CONTEXT ---\n{story}\n--- END CONTEXT ---\n\n"

        f"Respond directly to the user's question, strictly in the persona of {active_character}."

    )

   

    config = types.GenerateContentConfig(

        system_instruction=system_instruction

    )



    try:

        # Convert the history format from frontend to Gemini format

        gemini_history = []

        for msg in chat_history:

            role = msg.get("role", "user")

            parts = msg.get("parts", [])

            if parts:

                text = parts[0].get("text", "")

                gemini_history.append({"role": role, "parts": [{"text": text}]})



        response = client.models.generate_content(

            model=MODEL_NAME,

            contents=gemini_history,

            config=config

        )

        character_response = response.text.strip()

        return jsonify({"response": character_response})

    except Exception as e:

        logging.error(f"Chat Error: {e}")

        return jsonify({"error": f"An error occurred during character chat: {str(e)}"}), 500





# 4️⃣ Google Search / Excerpt Retrieval - Using Grounding Tool

# 4️⃣ Google Search / Excerpt Retrieval - Using Grounding Tool
@app.route("/search_excerpt", methods=["POST"])
def search_excerpt():
    """Uses Google Search grounding to find external story excerpts or summaries."""
    try:
        data = request.get_json(force=True)
        print("DEBUG | raw JSON:", data)
    except Exception as e:
        print("DEBUG | could not parse JSON:", e)
        data = {}

    query = (data.get("query") or "").strip()

    if len(query) < 5:
        return jsonify({"error": "Query too short (minimum 5 characters)"}), 400

    system_instruction = (
        "Act as an expert literary researcher. Use Google Search to find and extract the "
        "full, detailed text of the specified chapter, section, or passage from the user's request. "
        "Prioritize public domain text sources. Extract the text and strip away ALL headers, footers, "
        "summaries, and commentary. Return the result as a single, cohesive passage suitable for deep "
        "structural analysis."
    )

    # Configure the tool for Google Search Grounding
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        tools=[{"google_search": {}}]
    )

    user_query = f'Find and return the text for the specific passage: "{query}".'

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[user_query],
            config=config
        )

        excerpt_text = (getattr(response, "text", None) or "").strip()

        # --- Safe grounding extraction (handles all response types) ---
        sources = []
        try:
            candidate = response.candidates[0] if response.candidates else None
            grounding_metadata = getattr(candidate, "grounding_metadata", None)

            if grounding_metadata:
                # Try multiple possible attribute paths for compatibility
                if hasattr(grounding_metadata, "grounding_attributions"):
                    for attr in grounding_metadata.grounding_attributions:
                        if hasattr(attr, "web") and attr.web and getattr(attr.web, "uri", None):
                            sources.append({
                                "uri": attr.web.uri,
                                "title": getattr(attr.web, "title", "Unknown Source")
                            })
                elif hasattr(grounding_metadata, "search_results"):
                    for result in grounding_metadata.search_results:
                        sources.append({
                            "uri": getattr(result, "uri", None),
                            "title": getattr(result, "title", "Unknown Source")
                        })
        except Exception as meta_err:
            logging.warning(f"Grounding metadata parsing issue: {meta_err}")

        return jsonify({"excerpt": excerpt_text, "sources": sources})

    except Exception as e:
        logging.error(f"Search Excerpt Error: {e}")
        return jsonify({
            "error": f"An error occurred during search/excerpt retrieval: {str(e)}"
        }), 500





# --- RUN APP ---

if __name__ == "__main__":

    # Ensure that in a production environment, debug=True is disabled

    app.run(debug=True)