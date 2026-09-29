FROM python:3.14-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY dev_server.py .

EXPOSE 9093
CMD ["python", "dev_server.py"]
