/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_util = require('util');
var mod_stream = require('stream');

var mod_jsprim = require('jsprim');

function
SplitDuplex(options)
{
	var self = this;

	mod_stream.Duplex.call(self, options);

	/*
	 * The input and output passthrough streams should do no additional
	 * buffering:
	 */
	var pt_opts = mod_jsprim.mergeObjects(options, {
		highWaterMark: 0
	}, null);
	self.spld_writeside = new mod_stream.PassThrough(pt_opts);
	self.spld_readside = new mod_stream.PassThrough(pt_opts);

	self.spld_read_active = false;
	self.spld_data_needed = false;
	self.spld_data_avail = false;
	self.spld_readside.on('readable', function () {
		/*
		 * Data is available to be read on our Readable side, from
		 * the underlying output stream.
		 */
		self.spld_data_avail = true;
		self._service_read();
	});
	self.spld_readside.once('end', function () {
		self.push(null);
	});

	self.once('finish', function () {
		/*
		 * The Writable side of the duplex stream has reached the
		 * end of its input stream; propagate this condition to
		 * the underlying input stream.
		 */
		self.spld_writeside.end();
	});
}
mod_util.inherits(SplitDuplex, mod_stream.Duplex);

/*
 * The "write side" of the stream is a Readable, from which everything that is
 * written to the SplitDuplex may be read.
 */
SplitDuplex.prototype.streamWriteSide = function
streamWriteSide()
{
	return (this.spld_writeside);
};

/*
 * The "read side" of the stream is a Writable.  Data to be read from the
 * SplitDuplex should be written to this side.
 */
SplitDuplex.prototype.streamReadSide = function
streamReadSide()
{
	return (this.spld_readside);
};

SplitDuplex.prototype._read = function
_read()
{
	/*
	 * Our consumer has requested data from our Readable (output) side.
	 */
	this.spld_data_needed = true;
	this._service_read();
};

SplitDuplex.prototype._service_read = function
_service_read()
{
	/*
	 * We require _both_ that the output stream has data to read, _and_
	 * that the Duplex itself is being read from; otherwise there is no
	 * need to move data.
	 */
	if (!this.spld_data_needed || !this.spld_data_avail) {
		return;
	}

	/*
	 * Protect against recursive calls to _service_read():
	 */
	if (this.spld_read_active) {
		return;
	}
	this.spld_read_active = true;

	for (;;) {
		var input = this.spld_readside.read();

		if (input === null) {
			/*
			 * There was no more data from the output passthrough,
			 * so go back to sleep for now.
			 */
			this.spld_data_avail = false;
			this.spld_read_active = false;
			return;
		}

		if (!this.push(input)) {
			/*
			 * No more data fits in our outbound buffer; sleep for
			 * now.
			 */
			this.spld_data_needed = false;
			this.spld_read_active = false;
			return;
		}
	}
};

SplitDuplex.prototype._write = function
_write(ch, enc, done)
{
	return (this.spld_writeside.write.apply(this.spld_writeside,
	    arguments));
};

module.exports = SplitDuplex;
