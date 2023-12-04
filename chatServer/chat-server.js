// Require the packages we will use:
const http = require("http"),
  fs = require("fs");

const port = 3456;
const file = "client.html";
// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html, on port 3456:
const server = http.createServer(function (req, res) {
  // This callback runs when a new connection is made to our HTTP server.

  fs.readFile(file, function (err, data) {
    // This callback runs when the client.html file has been read from the filesystem.

    if (err) return res.writeHead(500);
    res.writeHead(200);
    res.end(data);
  });
});
server.listen(port);

// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
  wsEngine: "ws",
});

//Constructor function for a Room Object
//When creating a room, it takes in the creators username, the password (none is passed as default for public rooms), and a name for the room, and roomId and color
//users and usersocketids as well as permenentBanListSocketId and permentBanUsers are both parallel arrays
function Room(creator, password, name, id, color) {
  this.creator = creator;
  this.password = password;
  this.name = name;
  this.users = []; //list of usernames
  this.userSocketIds = []; //list of socket.ids (unique)
  this.id = id;
  this.permanentBanListSocketId = []; //list of banned socketids
  this.permanentBanUsers = []; //listof banned usernames
  this.color = color;
}

//room id
//This will be incremented throughout the code
let roomId = 1;

//when a Room object is created append it to the roomList array
const roomList = [];

//Lobby color is white
const defaultLobbyColor = "#FFFFFF";

//default lobby object
const lobby = new Room("none", "none", "Lobby", roomId, defaultLobbyColor);

//adds the loby to the roomList
roomList.push(lobby);

//Locations keeps track of which room a user is in => key: socket.id (userid): room names
let locations = {};

// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);
io.sockets.on("connection", function (socket) {
  // This callback runs when a new Socket.IO connection is established.

  //Creating Room event: adds an entry to the rooms object
  socket.on("create_room", function (data) {
    //before we create a room, increment the roomId so that it is unique amongst each room
    roomId++;
    //gets the rooms name, password,creator, and color from the data passed in from the client side
    let roomName = data.roomName;
    let roomPassword = data.roomPassword;
    let roomCreator = data.creator;
    let color = data.roomBackgroundColor;
    console.log("Creating room");
    console.log(roomName + " " + roomPassword + " " + roomCreator);
    let newRoom = new Room(roomCreator, roomPassword, roomName, roomId, color); //creates the new room object
    roomList.push(newRoom); //pushes the new room object to the roomList
    io.sockets.emit("displayJoinChatRoomButtons", roomList); //calls the displayJoinChatRoomButtons event sending the list of all rooms
  });

  //displays the current chatRooms
  socket.on("displayRooms", () => {
    io.sockets.emit("displayJoinChatRoomButtons", roomList);
  });

  //this socket is for kicking a user out of a room
  socket.on("kick_user", (data) => {
    //gets the user room name and active user from the data passed in from the client side
    const kickUser = data.user;
    const roomName = locations[socket.id]; // Get the name of the room where the kick request is coming from
    const activeUser = data.activeUser;

    //Check if the roomName is valid/exists
    if (roomName) {
      // Find the room object based on its name
      const room = roomList.find((room) => room.name === roomName);

      //if the room object is valid/exists and the activeUseris equal to the room creator (since only the room creator can kick a user)
      if (room && activeUser == room.creator) {
        //gets both the user and socket index
        const userIndex = room.users.indexOf(kickUser);
        const socketIdIndex = room.userSocketIds.indexOf(socket.id);

        //checks if the indices are valid positions
        // aka seeing If the user to be kicked is found in the room's user list and their socket ID is found
        if (userIndex !== -1 && socketIdIndex !== -1) {
          //if the indices are valid we get the id and username from the corresponding arrays
          let kickedSocketId = room.userSocketIds[userIndex];
          let kickedUserName = kickUser;
          console.log(kickedSocketId);
          delete locations[kickedSocketId]; //delete the location
          room.users.splice(userIndex, 1); // Remove the user from the user list
          room.userSocketIds.splice(userIndex, 1); // Remove the socket ID from the list

          console.log("new room:");
          console.log(room);
          console.log(locations);

          //checks if the banLength is permanent (This case handles permanent bans!)
          if (data.banLength == "permanent") {
            console.log("Permanent ban!");
            room.permanentBanListSocketId.push(kickedSocketId); //adds the kicked socket id to the permanent ban list
            room.permanentBanUsers.push(kickedUserName); //adds the kicked user name to the permanent ban list

            //update the current user list after the ban
            io.to(room.name).emit("user_list", {
              users: room.users,
              room: room,
            }); //sends updated room list
            io.to(kickedSocketId).emit("ban_user_message", { sender: false }); //sends message to the user who was kicked from the chat
            io.to(room.name).emit("ban_user_message", {
              //sends message to the rest of the people in the chat that the kicked user was banned
              kickedUser: kickUser,
              sender: true,
            });

            console.log(typeof kickedSocketId);

            console.log("test socket");
            console.log(kickedSocketId);
            console.log(io.sockets.sockets.get(kickedSocketId));
            io.sockets.sockets.get(kickedSocketId).leave(room.name); //forces the kicked user to manually leave da room

            console.log("room and locations post ban");
            console.log(room);
            console.log(locations);
          } else {
            //this is the case that the banLength is not permanent (aka a temporary ban so kicking user from the room temporarily)
            io.to(room.name).emit("kick_user_message", {
              kickedUser: kickUser,
              sender: true,
            }); //sends message that the user has been kicked
            // Update the user list for the remaining users in the room
            io.to(room.name).emit("user_list", {
              users: room.users,
              room: room,
            }); //sends updated room list
            io.to(kickedSocketId).emit("kick_user_message", { sender: false }); //sends message to the user who was kicked from the chat

            io.sockets.sockets.get(kickedSocketId).leave(room.name); //forces the kicked user to manually leave da room

            console.log("room and locations post ban");
            console.log(room);
            console.log(locations);
          }
        }
      }
    }
  });

  //function to find a room object from the room list (which is an array of all room objects) based on the given roomId
  function findRoomById(roomId) {
    return roomList.find((room) => room.id === roomId);
  }

  //socket for deleting a room
  socket.on("delete_room", function (data) {
    console.log("Delete room server side");
    console.log(data.room);
    //grabs the room and roomid from the data
    const clientRoom = data.room;
    const roomId = clientRoom.id;
    console.log(roomId);

    //uses findRoomById function (written above) to find the corresponding room object based on the given id passed in from the data
    const room = findRoomById(roomId);
    console.log("server side room");
    console.log(room);

    //checks to make sure the given room object exists
    if (room) {
      console.log("room and locations before deletions");
      console.log(roomList);
      console.log(room);
      console.log(locations);

      // Notify users in the room that it's being deleted
      io.to(room.name).emit("room_deleted");

      // Update locations object to remove references to the deleted room in the locations object
      for (const socketId in locations) {
        if (locations[socketId] === room.name) {
          delete locations[socketId];
        }
      }

      // Make users leave the room (removes their literall sockets)
      for (const socketId of room.userSocketIds) {
        const socket = io.sockets.sockets[socketId];
        if (socket) {
          socket.leave(room.name);
        }
      }

      // Remove the room from roomList
      const roomIndex = roomList.indexOf(room);
      if (roomIndex !== -1) {
        roomList.splice(roomIndex, 1);
      }

      console.log("room and locations after deletions");
      console.log(roomList);
      console.log(room);
      console.log(locations);
    }
  });

  //checks if a user has been permanently banned before allowing admission into the room
  socket.on("check_ban", (data) => {
    //grabs the room id from the data
    const roomId = data.roomId;
    console.log(roomId);
    const room = roomList.find((room) => room.id == roomId); //find room object with corresponding id

    //checks to make sure the given room exists
    if (room) {
      //checks ban based on the socketId and emits event based on it
      if (room.permanentBanListSocketId.includes(socket.id)) {
        console.log("User is on the ban list");
        io.to(socket.id).emit("ban_status", { banned: true });
      } else {
        console.log("User is not on the ban lists");
        io.to(socket.id).emit("ban_status", { banned: false });
      }
    }
  });

  //socket for joining a room
  socket.on("join_room", function (data) {
    //grabs roomId and activeUser from the data
    const roomId = data.roomId;
    const activeUser = data.activeUser;
    console.log(roomId);
    const room = roomList.find((room) => room.id == roomId); //find room object with corresponding id

    console.log("join room");

    //checks to see if the room is a valid room
    if (room) {
      // Check if the user is permanently banned from the room
      if (room.permanentBanListSocketId.includes(socket.id)) {
        io.to(socket.id).emit("ban_status", { banned: true }); //send a ban status of true to the client for an updated message ensuring they do not join  the room
        return; // Return at this point so we don't allow banned user to join
      }

      room.users.push(activeUser); //pushes active username onto room
      room.userSocketIds.push(socket.id); //pushes socket id to the socketid list for the room object
      console.log("we made it??");
      socket.join(room.name); // Join the room on the server-side
      locations[socket.id] = room.name; // Update the user's location
      console.log("room");
      console.log(room);
      console.log("locations");
      console.log(locations);

      console.log("notifying users");
      // Notify all clients in the room about the new user
      io.to(room.name).emit("user_joined", { username: activeUser });

      console.log("sending list of users");
      // Send the list of users in the room to the client
      io.to(room.name).emit("user_list", { users: room.users, room: room });

      console.log("Updating room header"); //sending the new room header (only for the individual user)
      io.to(socket.id).emit("room_header", {
        name: room.name,
        color: room.color,
      });
    }
  });

  //socket for sending sends message to the chat
  socket.on("message_to_server", function (data) {
    const roomName = locations[socket.id]; //gets the correct room to send the message to
    if (roomName) {
      // Send the message only to clients in the same room
      io.to(roomName).emit("message_to_client", {
        username: data.username,
        message: data.message,
      });
    }
  });

  //socket for leaving a room
  socket.on("leave_room", function (data) {
    console.log("Leaving the room!!!");
    //grabs the roomname from the locations object and username from the data
    const roomName = locations[socket.id];
    const username = data.username;
    console.log("Room name: ", roomName);
    if (roomName) {
      console.log("inside da if");
      const room = roomList.find((room) => room.name === roomName); //finds the corresponding room object
      console.log("room object before deletion: ");
      console.log(room);
      if (room) {
        const usernameIndex = room.users.indexOf(username); //finds the index of the username
        const socketIndex = room.userSocketIds.indexOf(socket.id); //finds the index of the socketid
        console.log("The indices");
        console.log(usernameIndex);
        console.log(socketIndex);
        //ensures the username and socket indices are valid positions in their respective arrays
        if (usernameIndex != -1 && socketIndex != -1) {
          console.log("the idices");
          console.log(usernameIndex);
          console.log(socketIndex);
          room.users.splice(usernameIndex, 1); //removes the user from the user's array
          room.userSocketIds.splice(socketIndex, 1); //removes the socketId fromt the userSocketIds index
          let sock = socket.id; //grabs the socketId as a variable
          delete locations.sock; //removes user from locations object
          socket.leave(roomName); //officially removes the user on the socket server
          io.to(roomName).emit("user_left", { user: username }); //sends message that the user left
          console.log("room after user leaves");
          console.log(room);
          // Updaete the list of users in the room to the client
          io.to(room.name).emit("user_list", { users: room.users, room: room });
        }
      }
    }
  });

  //event for handling private messages
  socket.on("private_message", function (data) {
    console.log("from");
    console.log(data.from);
    //gets the from (sender) and to (reciever) users from the data, as well as the message from the data
    const from = data.from;
    const to = data.to;
    const message = data.message;
    console.log("room object");
    console.log(data.room);
    //the fromSocketId (sender) is the current socket.id since they are the ones making the request to the server
    const fromSocketId = socket.id;
    const room = data.room;
    //finds the toSocketId (socketId of reciever ) based on parallel array structure of users and userSocketIds in room object
    const indexSocketId = room.users.indexOf(to);
    const toSocketId = room.userSocketIds[indexSocketId];

    console.log(`toSocketId found: ${toSocketId}`);

    if (toSocketId) {
      //events for both the sender and the reciever in private messages
      io.to(toSocketId).emit("private_message", {
        from,
        message,
        sender: true,
      }); //reciever
      io.to(fromSocketId).emit("private_message", {
        to,
        message,
        sender: false,
        user: from,
      }); //sender
    } else {
      io.to(fromSocketId).emit("private_message", {
        to,
        message: `${to} is not available.`,
      });
    }
  });
});