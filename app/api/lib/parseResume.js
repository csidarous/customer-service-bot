// /pages/api/lib/parseResume.js
import pdfParse from 'pdf-parse';
import { getStorage, ref, getBytes } from 'firebase/storage';

export async function parseResume(filePath) {
  const storage = getStorage();
  const fileRef = ref(storage, filePath);
  const fileData = await getBytes(fileRef);

  const data = await pdfParse(fileData);
  return data.text; // Parsed text from the resume
}
