const { Client, Collection, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Manager } = require('erela.js');
const fs = require('fs');

// ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
// ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
// ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 

client.manager = new Manager({
  nodes: [{
    host: "lavalink.jirayu.net",
    port: 13591,
    password: "youshallnotpass",
    secure: false
  }],
  send: (id, payload) => {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  }
});

// Load saved queue state
let queueState = {};
try {
    queueState = JSON.parse(fs.readFileSync('playerState.json'));
} catch (err) {
    queueState = {};
}

client.on('ready', async () => {
  const commands = [
    new SlashCommandBuilder().setName('play').setDescription('Play a song')
      .addStringOption(option => option.setName('query').setDescription('The song to play').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop the music and clear the queue'),
    new SlashCommandBuilder().setName('pause').setDescription('Pause the current song'),
    new SlashCommandBuilder().setName('resume').setDescription('Resume the paused song'),
    new SlashCommandBuilder().setName('queue').setDescription('View the current queue'),
    new SlashCommandBuilder().setName('np').setDescription('Show now playing song'),
    new SlashCommandBuilder().setName('volume').setDescription('Set the volume')
      .addIntegerOption(option => option.setName('amount').setDescription('Volume level (1-150)').setRequired(true)),
    new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the queue'),
    new SlashCommandBuilder().setName('loop').setDescription('Loop the current song or queue')
      .addStringOption(option => option.setName('mode').setDescription('Track/Queue/Off').setRequired(true)),
    new SlashCommandBuilder().setName('remove').setDescription('Remove a song from the queue')
      .addIntegerOption(option => option.setName('index').setDescription('Position in queue').setRequired(true)),
    new SlashCommandBuilder().setName('seek').setDescription('Seek to a specific time in the song')
      .addIntegerOption(option => option.setName('seconds').setDescription('Seconds to seek').setRequired(true)),
    new SlashCommandBuilder().setName('lyrics').setDescription('Get lyrics for the current song'),
    new SlashCommandBuilder().setName('join').setDescription('Make the bot join your voice channel'),
    new SlashCommandBuilder().setName('leave').setDescription('Make the bot leave the voice channel')
  ];

  // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
  // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  console.log(`Started refreshing ${commands.length} application (/) commands.`)
  client.manager.init(client.user.id);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered');
  } catch (error) {
    console.error(error);
  }
});

client.manager.on('nodeConnect', async () => {
  console.log(`Node connected.`);
  // Wait for 30 seconds to ensure node is fully ready
  console.log('Waiting 30 seconds before restoring queues...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  console.log('Attempting to restore queues...');

  for (const [guildId, state] of Object.entries(queueState)) {
    try {
      const player = client.manager.create({
        guild: guildId,
        voiceChannel: state.voiceChannel,
        textChannel: state.textChannel,
      });

      await player.connect();

      // First restore the queue
      if (state.queue && state.queue.length > 0) {
        for (const track of state.queue) {
          try {
            const res = await client.manager.search(track.uri || track.track);
            if (res.tracks && res.tracks[0]) {
              const newTrack = res.tracks[0];
              newTrack.requester = track.requester;
              player.queue.add(newTrack);
            }
          } catch (err) {
            console.error(`Failed to restore queue track: ${track.title}`, err);
          }
        }
      }

      // Then restore current track
      if (state.current) {
        try {
          const res = await client.manager.search(state.current.uri || state.current.track);
          if (res.tracks && res.tracks[0]) {
            const currentTrack = res.tracks[0];
            currentTrack.requester = state.current.requester;
            player.queue.add(currentTrack);
            await player.play();
            if (state.position) {
              await player.seek(state.position);
            }
          }
        } catch (err) {
          console.error(`Failed to restore current track: ${state.current.title}`, err);
        }
      }
    } catch (error) {
      console.error(`Error restoring queue for guild ${guildId}:`, error);
    }
  }
  console.log('Queue restoration completed');
});

client.on('raw', d => client.manager.updateVoiceState(d));

// Save queue state periodically
setInterval(() => {
  const state = {};
  client.manager.players.forEach(player => {
    if (player.queue.current || player.queue.length > 0) {
      state[player.guild] = {
        queue: player.queue.map(track => ({
          track: track.track,
          title: track.title,
          uri: track.uri,
          author: track.author,
          duration: track.duration,
          thumbnail: track.thumbnail,
          requester: track.requester
        })),
        current: player.queue.current,
        position: player.position,
        voiceChannel: player.voiceChannel,
        textChannel: player.textChannel
      };
    }
  });
  fs.writeFileSync('playerState.json', JSON.stringify(state, null, 2));
}, 5000);

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const { commandName } = interaction;

  let player = client.manager.get(interaction.guildId);
  if (!player) {
    player = client.manager.create({
      guild: interaction.guildId,
      voiceChannel: interaction.member.voice.channel.id,
      textChannel: interaction.channelId,
    });
    player.connect();
  }
  // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
  // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
  if (commandName === 'play') {
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }

    const query = interaction.options.getString('query');
    const res = await client.manager.search(query, interaction.user);

    if (res.loadType === 'LOAD_FAILED') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Load Failed')
          .setDescription('Failed to load the track.')
          .setFooter({ text: 'Please try again or use a different link' })]
      });
    }

    if (res.loadType === 'NO_MATCHES') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ No Results')
          .setDescription('No matches found for your search.')
          .setFooter({ text: 'Try using a different search term' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    const track = res.tracks[0];
    player.queue.add(track);
    if (!player.playing && !player.paused) player.play();

    const duration = track.duration ? new Date(track.duration).toISOString().substr(11, 8) : 'LIVE';
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('🎵 Added to Queue')
      .setThumbnail(track.thumbnail || 'https://cdn.discordapp.com/emojis/741605543046807626.gif')
      .setDescription(`[${track.title}](${track.uri})`)
      .addFields(
        { name: '👤 Author', value: track.author || 'Unknown', inline: true },
        { name: '⏱️ Duration', value: duration, inline: true },
        { name: '📊 Position', value: `#${player.queue.length}`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

    return interaction.reply({ embeds: [embed] });
  }
  if (commandName === 'skip') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }

    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    // Skip to the next song
    player.stop();

    // Get the next song from the queue
    const nextTrack = player.queue.length > 0 ? player.queue[0] : null;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('⏭️ Skipped')
          .setDescription(`The song ${player.queue.current.title} has been skipped.`)
          .setFooter({ text: 'Enjoy the new song!' }),

        nextTrack ? new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🎵 Now Playing')
          .setDescription(nextTrack.title)
          .setThumbnail(nextTrack.thumbnail)
          .addFields(
            { name: '👤 Author', value: nextTrack.author || 'Unknown', inline: true },
            { name: '⏱️ Duration', value: nextTrack.duration ? new Date(nextTrack.duration).toISOString().substr(11, 8) : 'LIVE', inline: true },
            { name: '📊 Position', value: `#${player.queue.size - player.queue.indexOf(nextTrack)}`, inline: true }
          )
          .setTimestamp()
          .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          : new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ No more songs in the queue')
            .setDescription('There are no more songs in the queue to play.')
      ]
    });
  }
  if (commandName === 'pause') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }

    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }

    // Pause the song
    player.pause(true);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('⏸️ Paused')
        .setDescription(`The player has been paused.`)]
    });
  }
  if (commandName === 'resume') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no current player paused.')
          .setFooter({ text: 'Please try again later' })]
      });
    }

    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }

    // Resume the song
    player.pause(false);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('▶️ Resumed')
        .setDescription(`The player has been resumed.`)]
    });
  }
  if (commandName === 'stop') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }

    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    // Stop the player and clear the queue
    player.stop();
    player.queue.clear();
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('⏹️ Stopped')
        .setDescription(`The player has been stopped.`)]
    });
  }
  if (commandName === 'queue') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song currently playing or the queue is empty.')
          .setFooter({ text: 'Please try again later' })]
      });
    }

    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }

    // Get the current queue and show all songs and their info in an embed description
    const queue = player.queue;
    const queueLength = queue.length; // Use `length` instead of `size`

    // If the queue is empty, return an error message
    if (queueLength === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('The queue is currently empty.')
                .setFooter({ text: 'Please add some songs to the queue.' })]
        });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    // Break the queue into chunks if it exceeds the character limit
    const chunks = [];
    let currentChunk = '';
    queue.forEach((track, index) => {
        const trackInfo = `${index + 1}. ${track.title} - ${track.author} (${formatDuration(track.duration)})`;

        // Check if adding this track exceeds the embed limit
        if ((currentChunk + trackInfo).length > 4096) {
            chunks.push(currentChunk);
            currentChunk = trackInfo; // Start a new chunk with the current track
        } else {
            currentChunk += trackInfo + '\n'; // Add the track to the current chunk
        }
    });

    // Push the last chunk if there is any leftover
    if (currentChunk) {
        chunks.push(currentChunk);
    }

    // If there are no chunks (i.e., no tracks were added), return an error
    if (chunks.length === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('No tracks found in the queue.')
                .setFooter({ text: 'Please try again later.' })]
        });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    // Send multiple embeds if needed
    const embeds = chunks.map((chunk, index) => new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🎶 Queue')
        .setDescription(chunk)
        .setFooter({ text: `Total songs in queue: ${queueLength}` })
    );

    return interaction.reply({ embeds });
  }

  // Function to format the duration in human-readable form (HH:MM:SS)
  function formatDuration(duration) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  if (commandName === 'volume') {
    if (!player) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }

    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }
    // Get the volume from the command options
    const volume = interaction.options.getInteger('amount');
    // Check if the volume is within the valid range (0-100)
    if (volume < 0 || volume > 150) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('The volume must be between 0 and 150.')
          .setFooter({ text: 'Please try again with a valid volume' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    // Set the volume of the player
    player.setVolume(volume);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔊 Volume')
        .setDescription(`The volume has been set to ${volume}.`)]
    })
  }
  if (commandName === 'np') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }
    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    // Get the current song and show its info in an embed
    const currentSong = player.queue.current;
    const res = await player.search(currentSong.uri, interaction.user);
    const track = res.tracks[0];
    const duration = track.duration ? new Date(track.duration).toISOString().substr(11, 8) : 'LIVE';
    const embed = new EmbedBuilder()
      .setTitle(currentSong.title)
      .setURL(currentSong.uri)
      .setAuthor({ name: currentSong.author })
      .setDescription(currentSong.isStream ? '◉ LIVE' : formatDuration(currentSong.duration))
      .setThumbnail(currentSong.thumbnail)
      .setColor('#00ff00')
      .setFooter({ text: `Requested by ${currentSong.requester.username}` })
      .addFields(
        { name: 'Author', value: currentSong.author, inline: true },
        { name: 'Duration', value: duration, },
        { name: 'Requested by', value: currentSong.requester.username, inline: true },
      )
      .setFooter({ text: 'Enjoy the music!' });
    return interaction.reply({ embeds: [embed] });
  }
  if (commandName === 'seek') {
    //seek seconds in the song options: integer name: seconds
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }
    // Get the seek time from the command options
    const seekTime = interaction.options.getInteger('seconds');
    // Check if the seek time is valid
    if (seekTime < 0 || seekTime > player.queue.current.duration) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('The seek time must be between 0 and the song duration.')
          .setFooter({ text: 'Please try again with a valid seek time' })]
      });
    }
    // Seek to the specified time in the song
    const seekTimeC = player.queue.current.duration * (seekTime / 100);
    player.seek(seekTimeC);
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('⏩ Seeked')
        .setDescription(`The player has been seeked to ${seekTime} seconds.`)]
    })
  }
  if (commandName === 'shuffle') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }

    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }
    // Shuffle the queue
    player.queue.shuffle();
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🔀 Shuffled')
        .setDescription(`The queue has been shuffled.`)]
    })
  }
  // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
  // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
  // Function to format the duration in human-readable form (HH:MM:SS)
  function formatDuration(duration) {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    const seconds = duration % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  if (commandName === 'autoplay') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }

    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }

    // Ensure autoplay is toggled properly
    if (player.get('autoplay')) {
      player.set('autoplay', false);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🔄 Autoplay Disabled')
          .setDescription('Autoplay has been disabled.')],
      });
    } else {
      player.set('autoplay', true);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🔄 Autoplay Enabled')
          .setDescription('Autoplay has been enabled.')],
      });
    }
  }
  if (commandName === 'loop') {
    if (!player || !player.queue.current) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('There is no song playing.')
          .setFooter({ text: 'Please try again later' })]
      });
    }
    // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
    // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
    if (!interaction.member.voice.channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in a voice channel!')
          .setFooter({ text: 'Please join a voice channel and try again' })]
      });
    }

    if (interaction.member.voice.channel.id !== player.voiceChannel) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error')
          .setDescription('You need to be in the same voice channel as the bot!')
          .setFooter({ text: 'Please join the same voice channel as the bot and try again' })]
      });
    }
    // toggle mode on played does not exist
    const loopMode = interaction.options.getString('mode').toLowerCase();
    if (loopMode === 'track') {
      //now add the song to the queue 100 times
      for (let i = 0; i < 25; i++) {
        player.queue.add(player.queue.current);
      }
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🔄 Loop Track')
          .setDescription('The current song has been added to the queue 25 times.')],
      })
    }
    if (loopMode === 'queue') {
      ///now add all songs in the same order 10 times for each song
      for (let i = 0; i < 10; i++) {
        player.queue.add(player.queue);
      }
      // ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
      // ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🔄 Loop Queue')
          .setDescription('The current queue has been added to the queue 10 times.')],
      })
    }
    if (loopMode === 'off') {
          player.queue.clear();

          return interaction.reply({
              embeds: [new EmbedBuilder()
                  .setColor('#00ff00')
                  .setTitle('🗑️ Queue Cleared')
                  .setDescription('All upcoming songs have been removed, but the currently playing song remains.')]
          });
    }
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Error')
        .setDescription('Invalid loop mode. Please use "track", "queue", or "off".')
        .setFooter({ text: 'Please try again with a valid loop mode' })]
    })
    }
});
client.login(process.env.DISCORD_TOKEN);
// ⭐ CREDITS: AZARESW | GITHUB: https://github.com/azaresw/Welcome-bot-djs-v14
// ⭐ DISCORD: https://dsc.gg/azeydev | SUPPORT, UPDATES, CUSTOM BOTS 
