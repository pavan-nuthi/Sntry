import re

with open('src/App.jsx', 'r') as f:
    content = f.read()

# find exactly where the `)}` is at the end of the System Logs Panel
start_idx = content.find('{/* System Logs Panel - Expanded */}')
if start_idx != -1:
    end_logs_idx = content.find(')}', start_idx)
    # The fix: insert `</div>` before the `)}`
    if end_logs_idx != -1:
        # Check if there is already a `</div>` right before it
        prev_text = content[end_logs_idx-10:end_logs_idx]
        if '</div>' not in prev_text:
            content = content[:end_logs_idx] + '</div>\n                        ' + content[end_logs_idx:]
            
            with open('src/App.jsx', 'w') as f:
                f.write(content)
            print("Fixed JSX nesting")
        else:
            print("Already fixed?")
else:
    print("Could not find System Logs Panel")
