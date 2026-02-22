with open("src/App.jsx", "r") as f:
    text = f.read()

# Let's write a simple HTML/JSX tag balancer
import re

div_stack = []
lines = text.split("\n")
for i, line in enumerate(lines):
    # This is a very crude tag counter
    # just counting <div and </div
    opens = len(re.findall(r'<div\b', line))
    closes = len(re.findall(r'</div\b', line))
    for _ in range(opens):
        div_stack.append(i+1)
    for _ in range(closes):
        if div_stack:
            div_stack.pop()
    if 'roleMode ==="admin" &&' in line.replace(" ", ""):
        print(f"roleMode check at {i+1}")
    if i+1 in [257, 259, 316, 319, 365, 366, 367]:
        print(f"Line {i+1} [stack depth {len(div_stack)}]: {line.strip()}")

print(f"Final stack depth: {len(div_stack)}")
