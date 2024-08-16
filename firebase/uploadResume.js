// /firebase/uploadResume.js
import { getStorage, ref, uploadBytes } from 'firebase/storage';

export async function uploadResume(file) {
  const storage = getStorage();
  const storageRef = ref(storage, `resumes/${file.name}`);
  
  await uploadBytes(storageRef, file);
  return storageRef.fullPath;
}
