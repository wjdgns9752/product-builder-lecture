
import os

with open('app.js', 'r') as f:
    content = f.read()

# 1. Revert Spectrogram Color
# Old (Magma) to replace:
magma_loop = """    const value = dataArray[i];
    tempCtx.fillStyle = getMagmaColor(value);"""

# New (HSL) to restore:
hsl_loop = """    const value = dataArray[i];
    const percent = value / 255;
    const hue = (1 - percent) * 240; 
    tempCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;"""

if magma_loop in content:
    content = content.replace(magma_loop, hsl_loop)

# 2. Add Probability Chart Logic
# We need a global variable for the chart instance
if "let aiProbChart = null;" not in content:
    content = content.replace("let yamnetModel = null;", "let yamnetModel = null;\nlet aiProbChart = null;")

# Add init function for chart
if "function initProbChart()" not in content:
    chart_init_code = """
function initProbChart() {
    const ctx = document.getElementById('aiProbChart');
    if (!ctx) return;
    
    aiProbChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: '확률 (%)',
                data: [],
                backgroundColor: '#2196f3',
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false, max: 100 },
                y: { ticks: { font: { size: 10 } } }
            },
            plugins: { legend: { display: false } }
        }
    });
}
"""
    # Insert before analyzeNoiseCharacteristics
    idx = content.find("async function analyzeNoiseCharacteristics()")
    if idx != -1:
        content = content[:idx] + chart_init_code + "\n" + content[idx:]

# Call initProbChart in DOMContentLoaded or setupAI
if "initProbChart();" not in content:
    # Add to startMonitoring or setupAI. 
    # Let's add it to the end of setupAI inside the try block
    setup_marker = 'sysMsg.textContent = "✅ AI 준비 완료";'
    content = content.replace(setup_marker, setup_marker + '\n            initProbChart();')

# 3. Update analyzeNoiseCharacteristics to update the chart
# We need to inject the chart update logic.
# Find the UI update block.
ui_update_marker = "const recEl = document.getElementById('ai-step-recognition');"
chart_update_code = """
        // Update Probability Chart
        if (aiProbChart) {
            const top5 = rawPredictions.slice(0, 5);
            aiProbChart.data.labels = top5.map(p => p.className.substring(0, 15));
            aiProbChart.data.datasets[0].data = top5.map(p => (p.probability * 100).toFixed(1));
            aiProbChart.update();
        }
"""
if ui_update_marker in content and "aiProbChart.update()" not in content:
    content = content.replace(ui_update_marker, chart_update_code + "\n        " + ui_update_marker)

# 4. Use `predict` instead of `execute` for potentially better compatibility
# And ensure we handle the tensor correctly.
# The current code uses `execute`. I will change it to `predict` and remove the `scoreTensor` finding logic if it's too complex, 
# relying on the standard [scores, embeddings, spectrogram] output order of YAMNet.
# But `execute` with finding logic is robust. 
# The issue might be input shape.
# YAMNet TFJS expects [1, 16000] if loaded as GraphModel.
# I already have `expandDims(0)`.
# Let's keep `execute` but ensure `isModelProcessing` is reset properly (it is in my previous code).

with open('app.js', 'w') as f:
    f.write(content)
