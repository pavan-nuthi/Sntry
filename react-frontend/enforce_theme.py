import os
import re

dir_path = "src"

# This regex finds a light theme class followed by a dark theme class that uses the new palette, 
# and replaces both with just the new palette class.
# Example: "bg-white dark:bg-warm-100" -> "bg-warm-100"
# Example: "text-slate-800 dark:text-warm-900" -> "text-warm-900"
# Example: "border-slate-200 dark:border-warm-300" -> "border-warm-300"

pattern = re.compile(r'(?:[a-z0-9\-]+-[a-z0-9\/\[\]\#]+|bg-white|text-white)\s+dark:([a-zA-Z0-9\-]+(?:warm|peach|white|black)-[0-9a-zA-Z\/]+)')

def process_file(filepath):
    with open(filepath, "r") as f:
        content = f.read()
    
    original = content
    
    # We might need to run the substitution multiple times if there are adjacent pairs
    content = pattern.sub(r'\1', content)
    content = pattern.sub(r'\1', content) # run twice just in case
    
    # Let's also catch any standalone dark: classes that didn't have a light pair
    content = re.sub(r'dark:([a-zA-Z0-9\-]+(?:warm|peach|white|black)-[0-9a-zA-Z\/]+)', r'\1', content)
    
    # Fix any formatting anomalies
    content = content.replace('  ', ' ')
    
    if content != original:
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, dirs, files in os.walk(dir_path):
    for file in files:
        if file.endswith(".jsx") or file.endswith(".css"):
            process_file(os.path.join(root, file))

