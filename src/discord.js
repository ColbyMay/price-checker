// Discord bot integration for sending price alerts
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

/**
 * Discord notification service for sending price alerts
 */
class DiscordNotifier {
	constructor() {
		this.client = null;
		this.isReady = false;
	}

	/**
	 * Initializes the Discord bot client
	 * @param {string} token - Discord bot token
	 */
	async initialize(token) {
		if (!token) {
			throw new Error('Discord bot token is required');
		}

		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages
			]
		});

		this.client.once('ready', () => {
			console.log(`Discord bot logged in as ${this.client.user.tag}`);
			this.isReady = true;
		});

		this.client.on('error', (error) => {
			console.error('Discord client error:', error);
		});

		await this.client.login(token);
		
		// Wait for the bot to be ready
		await this.waitForReady();
	}

	/**
	 * Waits for the Discord client to be ready
	 * @param {number} timeout - Timeout in milliseconds
	 */
	async waitForReady(timeout = 10000) {
		const startTime = Date.now();
		
		while (!this.isReady && (Date.now() - startTime) < timeout) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		
		if (!this.isReady) {
			throw new Error('Discord bot failed to initialize within timeout');
		}
	}

	/**
	 * Sends price alert notifications for qualifying products
	 * @param {Array} products - Array of filtered products
	 * @param {string} channelName - Discord channel name to send messages to
	 * @param {string} websiteName - Name of the website being monitored
	 */
	async sendPriceAlerts(products, channelName, websiteName) {
		if (!this.isReady) {
			throw new Error('Discord bot is not ready');
		}

		if (!products || products.length === 0) {
			console.log('No products to notify about');
			return;
		}

		try {
			// Debug: Log all available channels
			console.log('=== Discord Channel Debug Info ===');
			console.log(`Looking for channel: "${channelName}"`);
			console.log(`Bot is in ${this.client.guilds.cache.size} guild(s)`);
			
			// Log all guilds the bot is in
			this.client.guilds.cache.forEach(guild => {
				console.log(`Guild: ${guild.name} (ID: ${guild.id})`);
				console.log(`  Bot has access to ${guild.channels.cache.size} channels`);
				
				// Log all channels in this guild
				guild.channels.cache.forEach(channel => {
					console.log(`  - Channel: "${channel.name}" (Type: ${channel.type}, ID: ${channel.id})`);
				});
			});
			
			// Try to find the channel using multiple methods
			let channel = null;
			
			// Method 1: Search in client.channels.cache (original method)
			channel = this.client.channels.cache.find(ch => 
				ch.name === channelName && ch.type === 0 // Text channel
			);
			
			if (!channel) {
				console.log(`Method 1 failed: Channel '${channelName}' not found in client.channels.cache`);
				
				// Method 2: Search through all guilds
				for (const guild of this.client.guilds.cache.values()) {
					channel = guild.channels.cache.find(ch => 
						ch.name === channelName && ch.type === 0
					);
					if (channel) {
						console.log(`Method 2 success: Found channel '${channelName}' in guild '${guild.name}'`);
						break;
					}
				}
			} else {
				console.log(`Method 1 success: Found channel '${channelName}' in client.channels.cache`);
			}
			
			if (!channel) {
				// Method 3: Try case-insensitive search
				for (const guild of this.client.guilds.cache.values()) {
					channel = guild.channels.cache.find(ch => 
						ch.name.toLowerCase() === channelName.toLowerCase() && ch.type === 0
					);
					if (channel) {
						console.log(`Method 3 success: Found channel '${ch.name}' (case-insensitive match) in guild '${guild.name}'`);
						break;
					}
				}
			}

			if (!channel) {
				// Provide detailed error message with available channels
				let availableChannels = [];
				this.client.guilds.cache.forEach(guild => {
					guild.channels.cache.forEach(ch => {
						if (ch.type === 0) { // Text channels only
							availableChannels.push(`${ch.name} (in ${guild.name})`);
						}
					});
				});
				
				const errorMsg = `Channel '${channelName}' not found. Available text channels: ${availableChannels.length > 0 ? availableChannels.join(', ') : 'None found'}`;
				throw new Error(errorMsg);
			}

			console.log(`Sending ${products.length} price alerts to #${channelName}`);

			// Send summary message first
			const summaryEmbed = new EmbedBuilder()
				.setTitle(`🛍️ ${websiteName} Price Alert`)
				.setDescription(`Found ${products.length} qualifying item${products.length > 1 ? 's' : ''} on sale!`)
				.setColor(0x00AE86)
				.setTimestamp();

			await channel.send({ embeds: [summaryEmbed] });

			// Send individual product alerts (limit to prevent spam)
			const maxAlerts = Math.min(products.length, 10);
			
			for (let i = 0; i < maxAlerts; i++) {
				const product = products[i];
				await this.sendProductAlert(channel, product);
				
				// Add small delay to prevent rate limiting
				if (i < maxAlerts - 1) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}

			if (products.length > maxAlerts) {
				const remainingEmbed = new EmbedBuilder()
					.setDescription(`... and ${products.length - maxAlerts} more items. Check the website for full details!`)
					.setColor(0xFFAA00);
				
				await channel.send({ embeds: [remainingEmbed] });
			}

		} catch (error) {
			console.error('Error sending Discord notifications:', error);
			throw error;
		}
	}

	/**
	 * Sends a notification for a single product
	 * @param {Object} channel - Discord channel object
	 * @param {Object} product - Product object
	 */
	async sendProductAlert(channel, product) {
		const embed = new EmbedBuilder()
			.setTitle(product.name)
			.setURL(product.productUrl || 'https://www.holtrenfrew.com')
			.setColor(0xFF6B6B);

		// Add brand if available
		if (product.brand) {
			embed.addFields({ name: 'Brand', value: product.brand, inline: true });
		}

		// Add pricing information
		if (product.currentPrice) {
			embed.addFields({ name: 'Current Price', value: product.currentPrice, inline: true });
		}

		if (product.originalPrice && product.discountPercent > 0) {
			embed.addFields(
				{ name: 'Original Price', value: product.originalPrice, inline: true },
				{ name: 'Discount', value: `${product.discountPercent}% OFF`, inline: true }
			);
		}

		// Add match reason
		if (product.matchReason) {
			embed.addFields({ name: 'Match Criteria', value: product.matchReason, inline: false });
		}

		// Add product image if available
		if (product.imageUrl) {
			embed.setThumbnail(product.imageUrl);
		}

		embed.setTimestamp();

		await channel.send({ embeds: [embed] });
	}

	/**
	 * Sends a simple status message
	 * @param {string} channelName - Discord channel name
	 * @param {string} message - Status message to send
	 */
	async sendStatusMessage(channelName, message) {
		if (!this.isReady) {
			console.log('Discord bot not ready, skipping status message');
			return;
		}

		try {
			const channel = this.client.channels.cache.find(ch => 
				ch.name === channelName && ch.type === 0
			);

			if (channel) {
				await channel.send(message);
			}
		} catch (error) {
			console.error('Error sending status message:', error);
		}
	}

	/**
	 * Closes the Discord client connection
	 */
	async close() {
		if (this.client) {
			await this.client.destroy();
			this.isReady = false;
		}
	}
}

module.exports = DiscordNotifier;
