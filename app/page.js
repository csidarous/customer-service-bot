'use client'
import React, { useState, useRef, useEffect } from 'react';
import { Box, Button, Drawer, CssBaseline, AppBar, Toolbar, List, Typography, Divider, ListItem, ListItemButton, ListItemIcon, ListItemText, Stack, TextField, createTheme, ThemeProvider, IconButton, Input, Alert } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { storage } from '../firebase'; // Adjust the path as necessary
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import pdfToText from 'react-pdftotext';
import { firestore, auth, googleProvider } from '@/firebase';
import { signInWithRedirect, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, GoogleAuthProvider } from "firebase/auth";
import GoogleIcon from '@mui/icons-material/Google';

const drawerWidth = 200;
const headerHeight = 64;

export default function Home() {
  const scrollRef = useRef(null);
  const [name, setName] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm the Career Coach support assistant. How can I help you today?",
    },
  ]);
  const [message, setMessage] = useState('');
  const [view, setView] = useState('login'); // 'home', 'login', 'chat'
  const [username, setUsername] = useState('');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');


  const sendMessage = async () => {
    if (!message.trim()) return;

    setMessage('');
    setMessages((messages) => [
      ...messages,
      { role: 'user', content: message },
      { role: 'assistant', content: '' },
    ]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([...messages, { role: 'user', content: message }]),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        setMessages((messages) => {
          let lastMessage = messages[messages.length - 1];
          let otherMessages = messages.slice(0, messages.length - 1);
          return [
            ...otherMessages,
            { ...lastMessage, content: lastMessage.content + text },
          ];
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((messages) => [
        ...messages,
        { role: 'assistant', content: "I'm sorry, but I encountered an error. Please try again later." },
      ]);
    }
  };

  const [file, setFile] = useState(null);
  const [response, setResponse] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = (event) => {
    setFile(event.target.files[0]);
  };

  const uploadResumeHandler = async () => {
    if (!file) {
      alert("Please select a file first!");
      return;
    }

    setUploading(true);
    
    // Upload the file to Firebase Storage
    const storageRef = ref(storage, `resumes/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      null,
      (error) => {
        console.error('Upload failed:', error);
        setUploading(false);
      },
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        console.log('Download URL:', downloadURL);

        // Fetch the PDF file content
        const response = await fetch(downloadURL);
        const pdfBlob = await response.blob();

        // Send the PDF file to your backend
        const formData = new FormData();
        formData.append('file', pdfBlob, file.name);

        const res = await fetch("/api/process-resume", {
          method: "POST",
          body: formData,
        });
        
      
        const result = await res.json();
        const formattedFeedback = result.feedback; // Adds a newline before each numbered point
        
        const resumeAnalysisMessage = {
          role: 'assistant',
          content: `Resume Analysis Result:\n\n${formattedFeedback}`
        };
        
        //setResponse(result.feedback);
        setMessages((prevMessages) => [...prevMessages, resumeAnalysisMessage
      ]);
        setUploading(false);
      }
    );
  };

  const extractTextFromPDF = async (pdfUrl) => {
    return new Promise((resolve, reject) => {
      pdfToText(file, (err, text) => {
        if (err) {
          console.log("error")
          reject(err);  // Reject the promise if there is an error
        } else {
          console.log(text)
          resolve(text);  // Resolve the promise with the extracted text
        }
      });
    });
  };



  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const theme = createTheme({
    palette: {
      background: {
        default: '#edf0fa',
        white: '#ffffff',
      },
      primary: {
        main: '#6a83f5',
      },
      secondary: {
        main: '#ffffff',
      },
    },
    components: {
      MuiButtonBase: {
        defaultProps: {
          disableRipple: false,
        },
        styleOverrides: {
          root: {
            borderRadius: '14px',
          },
        },
      },
    },
  });


  const handleSignUp = async () => {
    setError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
      setUser(user);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSignIn = async () => {
    setError('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);  // Set user directly from the result
      setEmail('');
      setPassword('');
      setView('home')
    } catch (err) {
      console.error('Sign in error:', err.message);  // Log error for debugging
      setError(err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // This gives you a Google Access Token. You can use it to access the Google API.
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential.accessToken;
      // The signed-in user info.
      const user = result.user;
      console.log("User Info:", user);
      setUser(user); 
      setView('home')
      // Optional: Redirect or perform other actions after sign-in
      // For example, you could redirect to another page using:
      // window.location.href = '/dashboard';
  
    } catch (error) {
      // Handle Errors here.
      console.error("Error during sign-in:", error);
      const errorCode = error.code;
      const errorMessage = error.message;
      const email = error.customData?.email; // Optional chaining for safety
      const credential = GoogleAuthProvider.credentialFromError(error);
      // Handle specific errors as needed
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'home':
      return (
        <Box
          sx={{
            flexGrow: 1,
            p: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            bgcolor: 'background.default',
          }}
        >
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height="100vh"
          bgcolor="background.default"
        >
          <Typography variant="h2" gutterBottom>
            Welcome to Pathfinder AI
          </Typography>
          <Typography variant="h5" gutterBottom>
            Your personal career coach chatbot.
          </Typography>
        </Box>
        </Box>
      );

    case 'login':
      return (
        <Box
          sx={{
            flexGrow: 1,
            p: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            bgcolor: 'background.default',
          }}
        >
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          height="100vh"
          bgcolor="background.default"
        >
          <Typography variant="h2" gutterBottom>
            Welcome to Pathfinder AI
          </Typography>
          <Typography variant="h5" gutterBottom>
            Your personal career coach chatbot.
          </Typography>
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={2}
            width="100%"
            maxWidth="400px"
          >
            <Typography variant="h5">
              {isLogin ? "Login" : "Sign Up"}
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              variant="outlined"
              size="small"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              label="Email"
              fullWidth
            />
            <TextField
              variant="outlined"
              size="small"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              label="Password"
              fullWidth
            />
            <Button
              variant="contained"
              onClick={isLogin ? handleSignIn : handleSignUp}
              fullWidth
            >
              {isLogin ? "Login" : "Sign Up"}
            </Button>
            <Button onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Create an account" : "Already have an account? Login"}
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<GoogleIcon />}
              onClick={handleGoogleSignIn}
              sx={{ textTransform: 'none' }} // Optional: Prevents uppercase text transformation
            >
              Sign in with Google
            </Button>
          </Box>
        </Box>
        </Box>
      );

    case 'createAccount':
      return (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100vh" bgcolor="background.default">
          <Typography variant="h4" gutterBottom>
            Create an Account
          </Typography>
          <TextField
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{ marginBottom: 2, borderRadius: '14px'}}
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ marginBottom: 2, borderRadius: '14px'}}
          />
          <Button variant="contained" color="primary" onClick={handleSignUp} sx={{ borderRadius: '14px'}}>
            Sign Up
          </Button>
        </Box>
      );
      case 'chat':
      return (
        <Box
            component="main"
            height={'100vh'}
            sx={{ flexGrow: 1, bgcolor: 'background.white', p: 3, paddingTop: 0 }}
        >
            <Box height={headerHeight}></Box>
            <Box
                width="100%"
                height={`calc(100vh - ${headerHeight}px)`}
                display="flex"
                flexDirection="column"
                justifyContent="center"
                alignItems="center"
                sx={{ bgcolor: 'background.default' }}
                borderRadius={5}
            >
                <Stack
                    direction={'column'}
                    width="100%"
                    height="100%"
                    p={2}
                    spacing={3}
                >
                    <Stack
                        direction={'column'}
                        spacing={2}
                        flexGrow={1}
                        overflow="auto"
                        maxHeight="100%"
                    >
                        {messages.map((message, index) => (
                            <Box
                                key={index}
                                display="flex"
                                justifyContent={
                                    message.role === 'assistant' ? 'flex-start' : 'flex-end'
                                }
                            >
                                <Box
                                    maxWidth={'65%'}
                                    bgcolor={
                                        message.role === 'assistant'
                                            ? 'secondary.main'
                                            : 'primary.main'
                                    }
                                    color={
                                        message.role === 'assistant'
                                            ? 'black'
                                            : 'white'
                                    }
                                    borderRadius={5}
                                    p={3}
                                >
                                    {message.content}
                                </Box>
                            </Box>
                        ))}
                        <Box ref={scrollRef}></Box>
                    </Stack>

                    <Stack direction={'row'} spacing={2}>
                        <TextField
                            label="Message . . ."
                            fullWidth
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disableBorder
                            InputProps={{
                                style: {
                                    borderRadius: "14px",
                                }
                            }}
                        />
                        <Button variant="contained" onClick={sendMessage} sx={{ borderRadius: '14px' }}>
                            Send
                        </Button>

                        <input
                            type="file"
                            id="resume-upload"
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <label htmlFor="resume-upload">
                            <IconButton color="primary" component="span">
                                <AttachFileIcon />
                            </IconButton>
                        </label>
                        <Button
                            variant="contained"
                            onClick={uploadResumeHandler}
                            sx={{ borderRadius: '14px' }}
                        >
                            {uploading ? 'Uploading...' : 'Upload Resume'}
                        </Button>
                    </Stack>
                </Stack>
            </Box>
        </Box>
    );


      default:
        return null;
    }
  };
  
  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex' }}>
        <CssBaseline />
        <AppBar
          position="fixed"
          height={headerHeight}
          elevation={0}
          sx={{ width: `calc(100% - ${drawerWidth}px)`, ml: `${drawerWidth}px` }}
        >
          <Toolbar elevation={0} sx={{ bgcolor: 'background.white', color: 'black'}} spacing={2} >
            <AccountCircleIcon/>
            <Typography variant="h6" noWrap component="div">
              Hello {username}
            </Typography>
          </Toolbar>
        </AppBar>
        <Drawer
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
            },
          }}
          variant="permanent"
          anchor="left"
        >
          <Toolbar elevation={0} sx={{ bgcolor: 'background.white', color: 'black'}} spacing={2} >
            <Typography variant="h6" noWrap component="div">
              Pathfinder AI
            </Typography>
          </Toolbar>
          <Divider />
          <List color='black' spacing={1}>
            <ListItem key={'Home'} disablePadding>
              <ListItemButton onClick={() => setView('home')}>
                <ListItemIcon>
                  <HomeIcon />
                </ListItemIcon>
                <ListItemText primary={'Home'} />
              </ListItemButton>
            </ListItem>
  
            {user && (
              <>
                <ListItem key={'Chat'} disablePadding>
                  <ListItemButton onClick={() => setView('chat')}>
                    <ListItemIcon>
                      <ChatBubbleIcon />
                    </ListItemIcon>
                    <ListItemText primary={'Chat'} />
                  </ListItemButton>
                </ListItem>
  
                <ListItem key={'Logout'} disablePadding>
                  <ListItemButton onClick={() => {
                    handleSignOut();
                    setView('login');
                  }}>
                    <ListItemIcon>
                      <AccountCircleIcon />
                    </ListItemIcon>
                    <ListItemText primary={'Logout'} />
                  </ListItemButton>
                </ListItem>
              </>
            )}
          </List>
        </Drawer>
        
          {renderContent()}
      </Box>
    </ThemeProvider>  
  );
}
