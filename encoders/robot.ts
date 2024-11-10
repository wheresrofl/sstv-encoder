import { encoderFunction, mode, sampleFunction, sampleTuple } from '../lib/types'
import { resizeImage, rgb2yuv, yuv2freq } from '../lib/utils'

const robotEncoder: encoderFunction = async (selectedMode, img, encoder) => {
    if(encoder.resizeImage) img = resizeImage(img, null, 240, encoder.objectFit)
    
    if(selectedMode == mode.ROBOT_36) encoder.sampleCalibrationHeader(8)
    else if(selectedMode == mode.ROBOT_72) encoder.sampleCalibrationHeader(12)

    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
    let yScanDuration: number, uvScanDuration: number, porchFreq: number

    if(selectedMode == mode.ROBOT_36){
        yScanDuration = 88
        uvScanDuration = 44
        porchFreq = 1500
    }else if(selectedMode == mode.ROBOT_72){
        yScanDuration = 138
        uvScanDuration = 69
        porchFreq = 1900
    }else{
        throw Error('Invalid ROBOT mode')
    }
    
    const
        syncPulse: sampleTuple = [ 1200, 9 ],
        syncPorch: sampleTuple = [ 1500, 3 ],
        separationPulse: sampleTuple = [ 1500, 4.5 ],
        oddSeparationPulse: sampleTuple = [ 2300, 4.5 ],
        porch: sampleTuple = [ porchFreq, 1.5 ]

    const
        ySamples = encoder.sampleRate * (yScanDuration / 1000.0),
        yScale = info.width / ySamples,
        uvSamples = encoder.sampleRate * (uvScanDuration / 1000.0),
        uvScale = info.width / uvSamples
    
    function scanLine(line: number[], n_samples: number, scale: number){
        for(let i = 0; i < n_samples; ++i)
            encoder.sample(line[Math.floor(scale * i)], null)
    }

    for(let y = 0; y < info.height; ++y){
        const isEven = y % 2 == 0

        // create yuv scans, where [0,1,2] = [y,u,v] scans of the line
        const yuvScans: number[][] = [ [], [], [] ]
        for(let x = 0; x < info.width; ++x){
            const offset = (y * info.width + x) * info.channels
            const yuv = rgb2yuv(data[offset], data[offset + 1], data[offset + 2])
            for(const c in yuv) yuvScans[c].push(yuv2freq(yuv[c]))
        }

        // sync + y-scans
        encoder.sample(...syncPulse)
        encoder.sample(...syncPorch)
        scanLine(yuvScans[0], ySamples, yScale)

        if(selectedMode == mode.ROBOT_36){
            // similar to node-sstv, no averaging is taking place -- too much work

            // {u,v}-scan | scan U on even and Y on odds
            encoder.sample(...(isEven ? separationPulse : oddSeparationPulse))
            encoder.sample(...porch)
            scanLine(yuvScans[isEven ? 1 : 2], uvSamples, uvScale)
        }else if(selectedMode == mode.ROBOT_72){
            // u-scan
            encoder.sample(...separationPulse)
            encoder.sample(...porch)
            scanLine(yuvScans[1], uvSamples, uvScale)

            // v-scan
            encoder.sample(...separationPulse)
            encoder.sample(...porch)
            scanLine(yuvScans[2], uvSamples, uvScale)
        }
    }
}
export default robotEncoder