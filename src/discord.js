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
	 * Finds a text channel by name across all guilds the bot is in
	 * @param {string} channelName - Name of the channel to find
	 * @returns {Object|null} Discord channel object or null
	 */
	findChannel(channelName) {
		// Try exact match first
		let channel = this.client.channels.cache.find(ch =>
			ch.name === channelName && ch.type === 0
		);

		if (channel) return channel;

		// Search through all guilds
		for (const guild of this.client.guilds.cache.values()) {
			channel = guild.channels.cache.find(ch =>
				ch.name === channelName && ch.type === 0
			);
			if (channel) return channel;
		}

		// Case-insensitive fallback
		for (const guild of this.client.guilds.cache.values()) {
			channel = guild.channels.cache.find(ch =>
				ch.name.toLowerCase() === channelName.toLowerCase() && ch.type === 0
			);
			if (channel) return channel;
		}

		return null;
	}

	/**
	 * Sends price alert notifications for qualifying products
	 * @param {Array} products - Array of filtered products
	 * @param {string} channelName - Discord channel name to send messages to
	 * @param {string} websiteName - Name of the website being monitored
	 * @param {boolean} silent - Whether to send silent notifications (no @here mention)
	 */
	async sendPriceAlerts(products, channelName, websiteName, silent = false) {
		if (!this.isReady) {
			throw new Error('Discord bot is not ready');
		}

		if (!products || products.length === 0) {
			console.log('No products to notify about');
			return;
		}

		try {
			const channel = this.findChannel(channelName);

			if (!channel) {
				let availableChannels = [];
				this.client.guilds.cache.forEach(guild => {
					guild.channels.cache.forEach(ch => {
						if (ch.type === 0) {
							availableChannels.push(`${ch.name} (in ${guild.name})`);
						}
					});
				});

				throw new Error(`Channel '${channelName}' not found. Available: ${availableChannels.join(', ') || 'None'}`);
			}

			console.log(`Sending ${products.length} price alerts to #${channelName}${silent ? ' (silent)' : ''}`);

			// Send summary embed
			const newCount = products.filter(p => !p.isPriceDrop).length;
			const dropCount = products.filter(p => p.isPriceDrop).length;

			let description = `Found ${products.length} qualifying item${products.length > 1 ? 's' : ''} on sale!`;
			if (dropCount > 0) {
				description += `\n${newCount > 0 ? newCount + ' new, ' : ''}${dropCount} further reduced`;
			}

			const summaryEmbed = new EmbedBuilder()
				.setTitle(`${websiteName} Price Alert`)
				.setDescription(description)
				.setColor(silent ? 0x808080 : 0x00AE86)
				.setTimestamp();

			const messageOptions = { embeds: [summaryEmbed] };
			if (!silent) {
				messageOptions.content = '@here';
			}

			await channel.send(messageOptions);

			// Send individual product alerts (max 5 since duplicates are now eliminated)
			const maxAlerts = Math.min(products.length, 5);

			for (let i = 0; i < maxAlerts; i++) {
				const product = products[i];
				await this.sendProductAlert(channel, product);

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
	 * Sends a notification embed for a single product
	 * Uses different styling for price-drop re-notifications vs new finds
	 * @param {Object} channel - Discord channel object
	 * @param {Object} product - Product object
	 */
	async sendProductAlert(channel, product) {
		const isPriceDrop = !!product.isPriceDrop;

		const embed = new EmbedBuilder()
			.setTitle(isPriceDrop ? `Further Reduced: ${product.name}` : product.name)
			.setURL(product.productUrl || 'https://www.holtrenfrew.com')
			.setColor(isPriceDrop ? 0xFF4500 : 0xFF6B6B);

		if (product.brand) {
			embed.addFields({ name: 'Brand', value: product.brand, inline: true });
		}

		// Price display
		const priceDisplay = product.formattedCurrentPrice || `$${product.currentPrice}`;
		embed.addFields({ name: 'Current Price', value: priceDisplay, inline: true });

		const originalDisplay = product.formattedOriginalPrice || `$${product.originalPrice}`;
		if (product.discountPercent > 0) {
			embed.addFields(
				{ name: 'Original Price', value: originalDisplay, inline: true },
				{ name: 'Discount', value: `${product.discountPercent}% OFF`, inline: true }
			);
		}

		if (product.matchReason) {
			embed.addFields({ name: 'Match Criteria', value: product.matchReason, inline: false });
		}

		if (isPriceDrop) {
			embed.setFooter({ text: 'Price dropped since last notification' });
		}

		if (product.imageUrl) {
			embed.setThumbnail(product.imageUrl);
		}

		embed.setTimestamp();

		await channel.send({ embeds: [embed] });
	}

	/**
	 * Sends a status message to the specified channel
	 * @param {string} channelName - Name of the Discord channel
	 * @param {string} message - Message to send
	 * @param {boolean} mentionHere - Whether to add @here mention
	 */
	async sendStatusMessage(channelName, message, mentionHere = false) {
		try {
			const channel = this.findChannel(channelName);

			if (!channel) {
				console.error(`Channel #${channelName} not found`);
				return;
			}

			const finalMessage = mentionHere ? `@here ${message}` : message;
			await channel.send(finalMessage);
			console.log(`Status message sent to #${channelName}${mentionHere ? ' with @here mention' : ''}`);

		} catch (error) {
			console.error('Error sending status message:', error);
		}
	}

	/**
	 * Sends a summary message (no mention)
	 * @param {string} channelName - Channel name
	 * @param {string} message - Summary message
	 */
	async sendSummaryMessage(channelName, message) {
		await this.sendStatusMessage(channelName, message, false);
	}

	/**
	 * Sends an alert message with @here mention
	 * @param {string} channelName - Channel name
	 * @param {string} message - Alert message
	 */
	async sendAlertMessage(channelName, message) {
		await this.sendStatusMessage(channelName, message, true);
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
