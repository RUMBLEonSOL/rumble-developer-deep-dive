import re
import os
import unicodedata
import string

# Define the LaTeX file path
latex_file = 'rumble_developer_deep_dive.tex'  # Update this path if necessary

# Define the output directories and file extensions based on language
code_patterns = {
    'Rust': {
        'dir': 'contracts',
        'ext': 'rs'
    },
    'TypeScript': {
        'dir': 'backend',
        'ext': 'ts'
    },
    'Python': {
        'dir': 'ai-service',
        'ext': 'py'
    },
    'JavaScript': {
        'dir': 'frontend',
        'ext': 'jsx'
    },
    'Bash': {
        'dir': 'scripts',
        'ext': 'sh'
    },
    # Add more languages and patterns as needed
}

def sanitize_filename(name):
    """
    Sanitize the caption to create a safe filename.
    Removes or replaces characters that are invalid in filenames.
    """
    # Normalize the string
    name = unicodedata.normalize('NFKD', name).encode('ASCII', 'ignore').decode('ASCII')
    # Replace spaces with underscores
    name = name.replace(' ', '_')
    # Remove any characters that are not alphanumeric, underscores, or hyphens
    valid_chars = f"-_.() {string.ascii_letters}{string.digits}"
    sanitized = ''.join(c for c in name if c in valid_chars)
    # Remove any remaining invalid characters
    sanitized = re.sub(r'[^A-Za-z0-9_.-]', '', sanitized)
    return sanitized

# Read the LaTeX file content
with open(latex_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Regular expression to match lstlisting environments with language and caption parameters
pattern = re.compile(
    r'\\begin\{lstlisting\}\[(?:[^\]]*?)language\s*=\s*(?P<language>\w+)(?:,[^\]]*?)?(?:,caption\s*=\s*\{(?P<caption>[^\}]+)\})?\s*\](?P<code>.*?)\\end\{lstlisting\}',
    re.DOTALL | re.IGNORECASE
)

matches = pattern.finditer(content)

# Counters for each language to handle multiple snippets without captions
language_counters = {lang: 1 for lang in code_patterns.keys()}

for match in matches:
    language = match.group('language')
    caption = match.group('caption')
    code = match.group('code').strip()
    
    if not language:
        print("No language specified for a code snippet. Skipping.")
        continue
    
    if language not in code_patterns:
        print(f"Language '{language}' is not in the code_patterns. Skipping.")
        continue
    
    details = code_patterns[language]
    directory = details['dir']
    extension = details['ext']
    os.makedirs(directory, exist_ok=True)
    
    if caption:
        filename = sanitize_filename(caption) + f".{extension}"
    else:
        # Generate a default filename if caption is missing
        filename = f"{language.lower()}_snippet_{language_counters[language]}.{extension}"
        language_counters[language] += 1
    
    output_path = os.path.join(directory, filename)
    
    with open(output_path, 'a', encoding='utf-8') as code_file:
        code_file.write(code + '\n\n')  # Add spacing between snippets
    
    print(f"Extracted code for {language} into {output_path}")
