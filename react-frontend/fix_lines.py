with open('src/App.jsx', 'r') as f:
    lines = f.readlines()

# let's look around line 314-320
for i in range(312, 321):
    print(f"{i+1}: {lines[i].rstrip()}")
