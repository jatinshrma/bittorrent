HTTP_GUIDE
[https://www.bittorrent.org/beps/bep_0003.html]

UDP_GUIDE
[https://web.archive.org/web/20170101194115/http://bittorrent.org/beps/bep_0015.html]

GUIDE
[https://allenkim67.github.io/programming/2016/05/04/how-to-make-your-own-bittorrent-client.html]

Build a centralized function to manage pieces status by index.

Do handshake and wait for bitfield,
On bitfield, call for piece indexes.

When returned with indexes, fetch those indexes, on connection end, whatever the cause, recall the centralized function to mark the unfulfilled indexes 'unlocked'.

The centralized function will return a promise and the bitfield function will wait for it to be resolved.

The pieces status will be maintained as a global scope variable.

If a peer connection fulfills all the indexes, it will recall the centralized function to get the unlocked indexes and will continue downloading as a cycle.

If a peer connection fails without choke message, reinitiate the tcp connection with provided indexes.

If a peer connection chokes, remove it out of active peers.