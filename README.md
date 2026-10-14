# Google Docs Editor POC

This is a proof-of-concept application that demonstrates how to edit Google Docs in an iframe and download them as PDF.

## Setup Instructions

1.  **Install dependencies:**
    Open your terminal in the project root and run the following command to install the required packages:
    ```bash
    npm install
    ```

2.  **Set up Google API credentials:**
    a.  Go to the [Google Cloud Platform Console](https://console.cloud.google.com/).
    b.  Create a new project or select an existing one.
    c.  Enable the **Google Drive API** for your project.
    d.  Create a service account. Go to "APIs & Services" > "Credentials" > "Create Credentials" > "Service account".
    e.  Fill in the service account details and grant it the "Viewer" role.
    f.  Create a key for the service account. Select the service account, go to the "Keys" tab, click "Add Key" > "Create new key", and choose "JSON".
    g.  A JSON file with the credentials will be downloaded. Rename this file to `credentials.json` and place it in the root of this project.

3.  **Share the Google Doc:**
    a.  Open the Google Doc you want to edit.
    b.  Click the "Share" button.
    c.  In the "Add people and groups" field, paste the service account's email address (you can find it in the `credentials.json` file, it looks like `*@*.iam.gserviceaccount.com`).
    d.  Give the service account "Editor" permissions.
    e.  Click "Send".

4.  **Run the application:**
    Start the server by running the following command in your terminal:
    ```bash
    npm start
    ```

5.  **Access the application:**
    Open your web browser and go to `http://localhost:3000`.
    Enter the Google Doc ID in the input field and you should see the document in the iframe.
    You can get the Doc ID from the URL of the Google Doc. For example, in the URL `https://docs.google.com/document/d/12345abcdef/edit`, the ID is `12345abcdef`.

Now you can edit the document in the iframe and download it as a PDF.

## PDF Download Behavior

When you click the "Download as PDF" button:
1.  The Google Document is exported as a PDF by the backend server.
2.  The PDF file is saved in the `temp` directory within the project folder.
3.  The filename will be in the format: `<DOCUMENT_ID>-<TIMESTAMP>.pdf`.
4.  The file is **not** deleted from the `temp` directory after being downloaded by the user. This allows for further backend processing, such as digital signing.

## Troubleshooting

If the PDF download is not working, please check the following:

1.  **Server Logs:** Open the terminal where you are running `npm start` and look for any error messages. Errors like `Error downloading file from Google Drive: ...` or `Error writing file: ...` will provide clues about the problem.

2.  **`credentials.json` file:**
    *   Ensure the file is named exactly `credentials.json` and is placed in the root directory of the project.
    *   Make sure the file contains a valid service account key from the Google Cloud Platform.

3.  **Google Drive API:**
    *   Go to your project in the [Google Cloud Platform Console](https://console.cloud.google.com/).
    *   In the "APIs & Services" > "Enabled APIs & services" section, ensure that "Google Drive API" is listed. If not, you must enable it.

4.  **Document Sharing:**
    *   The service account needs permission to access the Google Doc.
    *   Open your Google Doc and click the "Share" button.
    *   Verify that the service account's email address (e.g., `...iam.gserviceaccount.com`) is listed.
    *   The service account must have at least **Viewer** permission to export the document. For editing in the iframe, it needs **Editor** permission.

5.  **Valid Document ID:**
    *   Make sure you are copying the correct ID from the Google Doc URL. The ID is the long string of characters between `/d/` and `/edit`.